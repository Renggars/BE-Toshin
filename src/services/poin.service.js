// src/services/poin.service.js
import moment from "moment";
import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import {
  sendAlertEmail,
  EMAIL_AM_PER_PLANT,
  EMAIL_HR,
} from "../utils/email.js";
import {
  getAMEmailTemplate,
  getHREmailTemplate,
} from "../utils/emailTemplate.js";
import { nowWIB } from "../utils/dateWIB.js";

const BASE_POINT = 100;

const STATUS_LEVEL_MAP = {
  AMAN: 5,
  TEGURAN: 4,
  SP1: 3,
  SP2: 2,
  SP3: 1,
};

const poinAwalStatus = (status) => {
  if (status === "AMAN") return 100;
  if (status === "TEGURAN") return 70;
  if (status === "SP1") return 50;
  if (status === "SP2") return 30;
  if (status === "SP3") return 0;
  return 100;
};

const ambilRiwayatPelanggaran = async (operatorId, targetMinus) => {
  const history = await prisma.poinDisiplin.findMany({
    where: { operatorId: operatorId },
    include: { tipeDisiplin: true },
    orderBy: { tanggal: "desc" },
  });

  let riwayat = [];
  let totalMinus = 0;

  for (const item of history) {
    const tanggal = new Date(item.tanggal).toLocaleDateString("id-ID");
    const pelanggaran = item.tipeDisiplin.namaTipeDisiplin;
    const potong = Math.abs(item.poinBerubah);

    riwayat.push(`${tanggal} – ${pelanggaran} (-${potong} poin)`);
    totalMinus += potong;

    if (totalMinus >= targetMinus) break;
  }

  return {
    teks: riwayat.reverse().join("\n"),
    total: totalMinus,
  };
};

/**
 * Get form data for discipline points input
 * Returns operators, discipline types, and shifts
 */
const getFormData = async () => {
  const [operators, tipeDisiplin, shifts] = await Promise.all([
    // Get all users with PRODUKSI role
    prisma.user.findMany({
      where: { role: "PRODUKSI" },
      select: {
        id: true,
        nama: true,
        plant: true,
        divisiId: true,
        divisi: {
          select: {
            namaDivisi: true,
          },
        },
      },
      orderBy: { nama: "asc" },
    }),
    // Get all discipline types
    prisma.tipeDisiplin.findMany({
      orderBy: { namaTipeDisiplin: "asc" },
    }),
    // Get all shifts
    prisma.shift.findMany({
      select: {
        id: true,
        namaShift: true,
        tipeShift: true,
        jamMasuk: true,
        jamKeluar: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    operators,
    tipeDisiplin: tipeDisiplin,
    shifts,
  };
};

const getUserCurrentPoin = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pointCycleStart: true },
  });

  const sekarang = new Date();

  // Ambil total perubahan dari history dari sejak cycle start
  const history = await prisma.poinDisiplin.aggregate({
    _sum: { poinBerubah: true },
    where: {
      operatorId: userId,
      tanggal: { gte: user.pointCycleStart },
    },
  });

  let currentTotal = BASE_POINT + (history._sum.poinBerubah || 0);

  return currentTotal;
};

const getStatusFromPoin = (poin) => {
  if (poin < 0) return "SP3";
  if (poin < 30) return "SP2";
  if (poin < 50) return "SP1";
  if (poin < 70) return "TEGURAN";
  return "AMAN";
};

const createPelanggaran = async (payload, staffId, imageFile = null) => {
  let operator;

  // Support both uidNfc and operatorId
  operator = await prisma.user.findFirst({
    where: {
      OR: [{ uidNfc: payload.uidNfc }, { id: payload.operatorId }],
    },
    include: { divisi: true },
  });

  if (!operator) {
    throw new ApiError(httpStatus.NOT_FOUND, "Operator tidak ditemukan");
  }

  if (operator.role !== "PRODUKSI") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Target bukan operator produksi",
    );
  }

  if (operator.status !== "active") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Operator tidak aktif");
  }

  // Check suspension
  if (
    operator.suspendedUntil &&
    new Date(operator.suspendedUntil) > new Date()
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Operator sedang dalam masa suspend",
    );
  }

  const tipeDisiplinId = parseInt(payload.tipeDisiplinId);
  const shiftId = parseInt(payload.shiftId);
  const { keterangan } = payload;

  const [tipe, staff, currentShift] = await Promise.all([
    prisma.tipeDisiplin.findUnique({ where: { id: tipeDisiplinId } }),
    prisma.user.findUnique({ where: { id: staffId } }),
    prisma.shift.findUnique({ where: { id: shiftId } }),
  ]);

  if (!tipe) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Tipe pelanggaran tidak ditemukan (ID: " + tipeDisiplinId + ")",
    );
  }

  const statusLama = getStatusFromPoin(operator.currentPoint);
  const poinSebelum = operator.currentPoint;
  const isReward = tipe.kategori?.toLowerCase().includes("penghargaan");

  const nilaiPerubahan = isReward ? Math.abs(tipe.poin) : -Math.abs(tipe.poin);
  const poinSetelahUpdate = operator.currentPoint + nilaiPerubahan;

  const statusBaru = getStatusFromPoin(poinSetelahUpdate);

  const bukti_foto = imageFile
    ? `/uploads/poin-images/${imageFile.filename}`
    : null;

  const now = nowWIB();
  let suspendedUntil = operator.suspendedUntil;

  // Logic: Set masa SP 6 bulan jika masuk SP1 atau SP2
  if (statusBaru === "SP1" || statusBaru === "SP2") {
    suspendedUntil = new Date(now);
    suspendedUntil.setMonth(suspendedUntil.getMonth() + 6);
  }

  // Simpan Transaksi & Update Saldo User secara Atomik (Transaction)
  const result = await prisma.$transaction(async (tx) => {
    // Update data di tabel User (cache)
    await tx.user.update({
      where: { id: operator.id },
      data: {
        currentPoint: poinSetelahUpdate,
        suspendedUntil,
      },
    });

    // Catat riwayat pelanggaran
    return tx.poinDisiplin.create({
      data: {
        operatorId: operator.id,
        staffId: staffId,
        tipeDisiplinId: tipeDisiplinId,
        shiftId: shiftId,
        poinBerubah: nilaiPerubahan,
        statusLevel: statusBaru,
        tanggal: now,
        buktiFoto: bukti_foto,
        keterangan: (keterangan && keterangan.trim() !== "") ? keterangan : "-",
      },
      include: { tipeDisiplin: true, operator: true },
    });
  });

  // Notifikasi jika status memburuk
  if (STATUS_LEVEL_MAP[statusBaru] < STATUS_LEVEL_MAP[statusLama]) {
    const poinAwalLama = poinAwalStatus(statusLama);
    const targetMinus = poinAwalLama - poinSetelahUpdate;
    const historyResult = await ambilRiwayatPelanggaran(
      operator.id,
      targetMinus,
    );

    const payloadEmail = {
      statusBaru,
      namaOperator: operator.nama,
      noReg: operator.noReg || "-",
      plant: operator.plant,
      shift: currentShift?.namaShift || "-",
      supervisor: staff?.nama || "-",
      pelanggaran: tipe.namaTipeDisiplin,
      keterangan: keterangan || "-",
      poinSebelum,
      poinSesudah: poinSetelahUpdate,
      timestamp: now,
      riwayatPelanggaran: historyResult.teks,
      totalMinusRiwayat: historyResult.total,
    };

    const plantKey = parseInt(operator.plant);
    const amEmails = EMAIL_AM_PER_PLANT[plantKey] || [];

    // Teguran → Assistant Manager Plant
    if (statusBaru === "TEGURAN") {
      if (amEmails.length > 0) {
        const subject = `[${statusBaru}] ${operator.nama} (${
          operator.noReg || "-"
        })`;
        const html = getAMEmailTemplate(payloadEmail);
        sendAlertEmail(amEmails.join(","), subject, html);
      }
    }

    // SP1 / SP2 / SP3 → HR + Assistant Manager Plant
    if (["SP1", "SP2", "SP3"].includes(statusBaru)) {
      const subject = `[${statusBaru}] ${operator.nama} (${
        operator.noReg || "-"
      })`;

      // To AMs
      if (amEmails.length > 0) {
        const htmlAM = getAMEmailTemplate(payloadEmail);
        sendAlertEmail(amEmails.join(","), subject, htmlAM);
      }

      // To HR
      if (EMAIL_HR.length > 0) {
        const htmlHR = getHREmailTemplate(payloadEmail);
        sendAlertEmail(EMAIL_HR.join(","), subject, htmlHR);
      }
    }
  }

  return result;
};

const getPoinDashboardStats = async (plant, tanggal) => {
  const whereOperator = {
    role: "PRODUKSI",
    ...(plant && { plant: String(plant) }),
  };

  // 1. Ambil Summary (Status Terkini User)
  const users = await prisma.user.findMany({
    where: whereOperator,
    select: {
      id: true,
      currentPoint: true,
    },
  });

  const summary = {
    total_operator: users.length,
    aman: users.filter((u) => u.currentPoint >= 70).length,
    peringatan: users.filter(
      (u) => u.currentPoint >= 50 && u.currentPoint < 70,
    ).length,
    kritis: users.filter((u) => u.currentPoint < 50).length,
  };

  if (users.length === 0) {
    return {
      summary,
      shift_stats: [],
      top_violations: [],
    };
  }

  // 2. Filter Tanggal untuk Statistik Pelanggaran
  let dateFilter = {};
  if (tanggal) {
    const startDate = new Date(tanggal);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(tanggal);
    endDate.setHours(23, 59, 59, 999);

    dateFilter = {
      tanggal: {
        gte: startDate,
        lte: endDate,
      },
    };
  }

  const targetUserIds = users.map((u) => u.id);

  // 3. Parallel Fetch untuk Shift Stats & Top Violations
  const [shiftStatsRaw, topViolationsRaw, masterShift, masterTipe] =
    await Promise.all([
      prisma.poinDisiplin.groupBy({
        by: ["shiftId"],
        _count: { id: true },
        where: {
          operatorId: { in: targetUserIds },
          ...dateFilter,
        },
      }),
      prisma.poinDisiplin.groupBy({
        by: ["tipeDisiplinId"],
        _count: { id: true },
        where: {
          operatorId: { in: targetUserIds },
          ...dateFilter,
        },
        orderBy: { _count: { id: "desc" } },
        take: 4,
      }),
      prisma.shift.findMany(),
      prisma.tipeDisiplin.findMany(),
    ]);

  // 4. Mapping Data
  const shift_stats = shiftStatsRaw.map((stat) => {
    const shiftInfo = masterShift.find((s) => s.id === stat.shiftId);
    const shiftName = shiftInfo?.namaShift || "Tanpa Shift";
    const type = shiftInfo?.tipeShift || "";
    return {
      label: shiftName,
      tipe_shift: type,
      value: stat._count.id,
    };
  });

  const top_violations = topViolationsRaw.map((v) => ({
    label:
      masterTipe.find((t) => t.id === v.tipeDisiplinId)?.namaTipeDisiplin ||
      "Lainnya",
    value: v._count.id,
  }));

  return { summary, shift_stats, top_violations };
};

const getPoinRankings = async (plant) => {
  const whereClause = {
    role: "PRODUKSI",
    ...(plant && { plant: String(plant) }),
  };

  const [worstUsers, bestUsers] = await Promise.all([
    prisma.user.findMany({
      where: whereClause,
      orderBy: { currentPoint: "asc" },
      take: 3,
      include: {
        _count: {
          select: { poinDisiplinOperator: true },
        },
        divisi: { select: { namaDivisi: true } },
      },
    }),
    prisma.user.findMany({
      where: whereClause,
      orderBy: { currentPoint: "desc" },
      take: 3,
      include: {
        _count: {
          select: { poinDisiplinOperator: true },
        },
        divisi: { select: { namaDivisi: true } },
      },
    }),
  ]);

  const formatUser = (user) => ({
    nama: user.nama,
    noReg: user.noReg,
    divisi: user.divisi?.namaDivisi || "-",
    fotoProfile: user.fotoProfile,
    poin: user.currentPoint,
    total_pelanggaran: user._count?.poinDisiplinOperator ?? 0,
    uidNfc: user.uidNfc,
  });

  return {
    worst: worstUsers.map(formatUser),
    best: bestUsers.map(formatUser),
  };
};

const getPoinHistory = async (filter, options) => {
  const { plant } = filter;
  const page = options.page || 1;
  const limit = options.limit || 10;
  const skip = (page - 1) * limit;

  const operatorWhere = {
    role: "PRODUKSI",
    ...(plant && { plant: String(plant) }),
  };

  const operators = await prisma.user.findMany({
    where: operatorWhere,
    select: { id: true },
  });

  const operatorIds = operators.map((op) => op.id);

  if (operatorIds.length === 0) {
    return {
      data: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
      },
    };
  }

  const whereClause = {
    operatorId: { in: operatorIds },
  };

  if (filter.tanggal) {
    const startDate = new Date(filter.tanggal);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(filter.tanggal);
    endDate.setHours(23, 59, 59, 999);

    whereClause.tanggal = {
      gte: startDate,
      lte: endDate,
    };
  }

  const [data, total] = await Promise.all([
    prisma.poinDisiplin.findMany({
      where: whereClause,
      include: {
        operator: {
          select: {
            nama: true,
            plant: true,
          },
        },
        shift: {
          select: {
            namaShift: true,
          },
        },
        tipeDisiplin: {
          select: {
            namaTipeDisiplin: true,
            kategori: true,
          },
        },
      },
      orderBy: {
        tanggal: "desc",
      },
      skip,
      take: limit,
    }),
    prisma.poinDisiplin.count({
      where: whereClause,
    }),
  ]);

  const transformedData = data.map((item) => ({
    id: item.id,
    nama_operator: item.operator.nama,
    plant: item.operator.plant,
    shift: item.shift?.namaShift || "N/A",
    tipe_disiplin: item.tipeDisiplin.namaTipeDisiplin,
    kategori: item.tipeDisiplin.kategori,
    poin_berubah: item.poinBerubah,
    status_level: item.statusLevel,
    tanggal: item.tanggal,
    bukti_foto: item.buktiFoto,
    keterangan: item.keterangan,
  }));

  return {
    data: transformedData,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getWeeklyStats = async (plant) => {
  const labels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const displayLabels = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const operatorWhere = {
    role: "PRODUKSI",
    ...(plant && { plant: String(plant) }),
  };

  const operators = await prisma.user.findMany({
    where: operatorWhere,
    select: { id: true },
  });

  const operatorIds = operators.map((op) => op.id);

  if (operatorIds.length === 0) {
    return {
      labels: displayLabels,
      series: [
        { name: "Pelanggaran", data: [0, 0, 0, 0, 0, 0, 0] },
        { name: "Penghargaan", data: [0, 0, 0, 0, 0, 0, 0] },
      ],
    };
  }

  const data = await prisma.poinDisiplin.findMany({
    where: {
      tanggal: {
        gte: sevenDaysAgo,
        lte: today,
      },
      operatorId: { in: operatorIds },
    },
    include: {
      tipeDisiplin: true,
    },
  });

  const statsMap = {};
  for (let i = 0; i < 7; i++) {
    const d = moment(sevenDaysAgo).add(i, "days");
    const dateStr = d.format("YYYY-MM-DD");
    const dayLabel = labels[d.day()];
    
    statsMap[dateStr] = {
      label: dayLabel,
      pelanggaran: 0,
      penghargaan: 0,
    };
  }

  data.forEach((item) => {
    const dateStr = moment(item.tanggal).format("YYYY-MM-DD");
    if (statsMap[dateStr]) {
      const kategori = item.tipeDisiplin.kategori;
      if (kategori === "PELANGGARAN") {
        statsMap[dateStr].pelanggaran++;
      } else if (kategori === "PENGHARGAAN") {
        statsMap[dateStr].penghargaan++;
      }
    }
  });

  const seriesPelanggaran = [];
  const seriesPenghargaan = [];

  displayLabels.forEach((label) => {
    const dayData = Object.values(statsMap).find(
      (item) => item.label === label,
    );
    seriesPelanggaran.push(dayData ? dayData.pelanggaran : 0);
    seriesPenghargaan.push(dayData ? dayData.penghargaan : 0);
  });

  return {
    labels: displayLabels,
    series: [
      {
        name: "Pelanggaran",
        data: seriesPelanggaran,
      },
      {
        name: "Penghargaan",
        data: seriesPenghargaan,
      },
    ],
  };
};

const getMonthlyStats = async (plant) => {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  const today = new Date();
  const currentYear = today.getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  const operatorWhere = {
    role: "PRODUKSI",
    ...(plant && { plant: String(plant) }),
  };

  const operators = await prisma.user.findMany({
    where: operatorWhere,
    select: { id: true },
  });

  const operatorIds = operators.map((op) => op.id);

  if (operatorIds.length === 0) {
    const emptyData = new Array(12).fill(0);
    return {
      labels: monthNames,
      series: [
        { name: "Pelanggaran", data: emptyData },
        { name: "Penghargaan", data: emptyData },
      ],
    };
  }

  const data = await prisma.poinDisiplin.findMany({
    where: {
      tanggal: {
        gte: startOfYear,
        lte: endOfYear,
      },
      operatorId: { in: operatorIds },
    },
    include: {
      tipeDisiplin: true,
    },
  });

  const months = [];
  for (let i = 0; i < 12; i++) {
    months.push({
      year: currentYear,
      month: i,
      label: monthNames[i],
      pelanggaran: 0,
      penghargaan: 0,
    });
  }

  data.forEach((item) => {
    const itemMonth = new Date(item.tanggal).getMonth();

    const monthData = months[itemMonth];
    if (monthData) {
      const kategori = item.tipeDisiplin.kategori;
      if (kategori === "PELANGGARAN") {
        monthData.pelanggaran++;
      } else if (kategori === "PENGHARGAAN") {
        monthData.penghargaan++;
      }
    }
  });

  return {
    labels: months.map((m) => m.label),
    series: [
      {
        name: "Pelanggaran",
        data: months.map((m) => m.pelanggaran),
      },
      {
        name: "Penghargaan",
        data: months.map((m) => m.penghargaan),
      },
    ],
  };
};

const getUserByNfc = async (uidNfc) => {
  const user = await prisma.user.findUnique({
    where: { uidNfc },
    include: {
      divisi: {
        select: {
          id: true,
          namaDivisi: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "User dengan NFC tersebut tidak ditemukan",
    );
  }

  if (user.role !== "PRODUKSI") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Hanya Operator yang dapat dikenakan poin disiplin",
    );
  }

  if (user.status !== "active") {
    throw new ApiError(httpStatus.BAD_REQUEST, "User tidak aktif");
  }

  if (user.suspendedUntil && new Date(user.suspendedUntil) > new Date()) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `User sedang di-suspend hingga ${user.suspendedUntil.toLocaleString()}`,
    );
  }

  const { password, ...safeUser } = user;
  return safeUser;
};

const createPelanggaranByNfc = async (payload, staffId) => {
  const { uidNfc, tipeDisiplinId, shiftId, keterangan } = payload;

  const operator = await prisma.user.findUnique({
    where: { uidNfc },
  });

  if (!operator) {
    throw new ApiError(httpStatus.NOT_FOUND, "Operator tidak ditemukan");
  }

  if (operator.role !== "PRODUKSI") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Target bukan operator");
  }

  if (operator.status !== "active") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Operator tidak aktif");
  }

  if (
    operator.suspendedUntil &&
    new Date(operator.suspendedUntil) > new Date()
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Operator sedang dalam masa suspend",
    );
  }

  const enrichedPayload = {
    operatorId: operator.id,
    tipeDisiplinId,
    shiftId,
    keterangan,
  };

  return createPelanggaran(enrichedPayload, staffId);
};

const resetAllUsersPoints = async () => {
  const sekarang = new Date();

  // Ambil semua user PRODUKSI
  const users = await prisma.user.findMany({
    where: { role: "PRODUKSI" },
  });

  // Proses satu per satu untuk mengecek status sanksi dan poin saat ini
  const updatePromises = users.map(async (user) => {
    const currentTotal = await getUserCurrentPoin(user.id);
    const status = getStatusFromPoin(currentTotal);

    // 1. SP3: Skip total (Tidak ikut reset)
    if (status === "SP3") {
      return Promise.resolve();
    }

    // 2. Cek Masa SPAktif (SP1/SP2 yang masih berjalan)
    const masihSP =
      (status === "SP1" || status === "SP2") &&
      user.suspendedUntil &&
      sekarang < user.suspendedUntil;

    if (masihSP) {
      // TIDAK di-reset jika masih dalam masa SP aktif.
      return Promise.resolve();
    }

    // 3. Tentukan saldo baru untuk siklus baru
    // Jika poin saat ini >= 100, pertahankan prestasinya sebagai saldo awal.
    // Jika poin < 100, reset saldo awal ke 100.
    const poinBaru = currentTotal >= 100 ? currentTotal : BASE_POINT;

    // Perbarui siklus poin untuk semua yang lolos pengecekan di atas
    return prisma.user.update({
      where: { id: user.id },
      data: {
        currentPoint: poinBaru,
        pointCycleStart: sekarang, // Reset siklus per hari ini
        suspendedUntil: null, // Hapus masa sanksi karena siklus baru dimulai
      },
    });
  });

  return Promise.all(updatePromises);
};

export default {
  getFormData,
  createPelanggaran,
  getUserCurrentPoin,
  getPoinDashboardStats,
  getPoinRankings,
  getPoinHistory,
  getWeeklyStats,
  getMonthlyStats,
  resetAllUsersPoints,
  getUserByNfc,
  createPelanggaranByNfc,
};
