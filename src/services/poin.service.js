// src/services/poin.service.js
import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import { sendAlertEmail } from "../utils/email.js";
import { getEmailTemplate } from "../utils/emailTemplate.js";

const BASE_POINT = 100;

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
        fk_id_divisi: true,
        divisi: {
          select: {
            nama_divisi: true,
          },
        },
      },
      orderBy: { nama: "asc" },
    }),
    // Get all discipline types
    prisma.tipeDisiplin.findMany({
      orderBy: { nama_tipe_disiplin: "asc" },
    }),
    // Get all shifts
    prisma.shift.findMany({
      select: {
        id: true,
        nama_shift: true,
        tipe_shift: true,
        jam_masuk: true,
        jam_keluar: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    operators,
    tipe_disiplin: tipeDisiplin,
    shifts,
  };
};

const getUserCurrentPoin = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { point_cycle_start: true },
  });

  const sekarang = new Date();
  const selisihHari = Math.floor(
    (sekarang - user.point_cycle_start) / (1000 * 60 * 60 * 24),
  );

  console.log(user.point_cycle_start);

  // Ambil total perubahan dari history
  const history = await prisma.poinDisiplin.aggregate({
    _sum: { poin_berubah: true },
    where: {
      fk_id_operator: userId,
      tanggal: { gte: user.point_cycle_start },
    },
  });

  let currentTotal = BASE_POINT + (history._sum.poin_berubah || 0);

  // Logic Reset 30 Hari: Jika < 100 reset, jika >= 100 pertahankan prestasi
  if (selisihHari >= 30 && currentTotal < 100) {
    await prisma.user.update({
      where: { id: userId },
      data: { point_cycle_start: sekarang },
    });
    return BASE_POINT;
  }

  return currentTotal;
};

const createPelanggaran = async (payload, staffId) => {
  let fk_id_operator;

  // Support both uid_nfc and fk_id_operator
  if (payload.uid_nfc) {
    // Convert uid_nfc to operator ID
    const operator = await prisma.user.findUnique({
      where: { uid_nfc: payload.uid_nfc },
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
      operator.suspended_until &&
      new Date(operator.suspended_until) > new Date()
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Operator sedang dalam masa suspend",
      );
    }

    fk_id_operator = operator.id;
  } else if (payload.fk_id_operator) {
    // Use provided operator ID directly
    fk_id_operator = payload.fk_id_operator;
  } else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Harus menyertakan uid_nfc atau fk_id_operator",
    );
  }

  const { fk_tipe_disiplin, fk_id_shift, keterangan } = payload;
  const hariIni = new Date();
  hariIni.setHours(0, 0, 0, 0);

  // Ensure IDs are integers
  const tipeId = parseInt(fk_tipe_disiplin);

  const [tipe, operator] = await Promise.all([
    prisma.tipeDisiplin.findUnique({ where: { id: tipeId } }),
    prisma.user.findUnique({
      where: { id: fk_id_operator },
      include: { divisi: true },
    }),
  ]);

  if (!operator) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Operator tidak ditemukan (ID: " + fk_id_operator + ")",
    );
  }

  if (!tipe) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Tipe pelanggaran tidak ditemukan (ID: " + tipeId + ")",
    );
  }

  const isReward = tipe.kategori?.toLowerCase().includes("penghargaan");

  const nilaiPerubahan = isReward ? Math.abs(tipe.poin) : -Math.abs(tipe.poin);
  const poinSetelahUpdate = operator.current_point + nilaiPerubahan;

  let status_level = "AMAN";
  let alertType = "";

  if (poinSetelahUpdate < 0) {
    status_level = "SP3";
    alertType = "SURAT PERINGATAN 3 (SP3)";
  } else if (poinSetelahUpdate < 30) {
    status_level = "SP2";
    alertType = "SURAT PERINGATAN 2 (SP2)";
  } else if (poinSetelahUpdate < 50) {
    status_level = "SP1";
    alertType = "SURAT PERINGATAN 1 (SP1)";
  } else if (poinSetelahUpdate < 70) {
    status_level = "TEGURAN";
  }

  // 3. Simpan Transaksi & Update Saldo User secara Atomik (Transaction)
  const result = await prisma.$transaction(async (tx) => {
    // Kurangi poin di tabel User
    await tx.user.update({
      where: { id: fk_id_operator },
      data: { current_point: poinSetelahUpdate },
    });

    // Catat riwayat pelanggaran
    return tx.poinDisiplin.create({
      data: {
        fk_id_operator,
        fk_id_staff: staffId,
        fk_tipe_disiplin,
        fk_id_shift: fk_id_shift,
        poin_berubah: nilaiPerubahan,
        status_level,
        tanggal: new Date(),
        keterangan,
      },
      include: { tipe_disiplin: true, operator: true },
    });
  });

  if (poinSetelahUpdate < 50) {
    const plantEmails = {
      1: "khoerunnisautami22@gmail.com, khoerunnisautami22@gmail.com",
      2: "khoerunnisautami22@gmail.com, khoerunnisautami22@gmail.com",
      3: "khoerunnisautami22@gmail.com, khoerunnisautami22@gmail.com",
    };

    const recipient = plantEmails[operator.plant];

    if (recipient) {
      const subject = `NOTIFIKASI ${alertType}: ${operator.nama} (Plant ${operator.plant})`;
      const htmlContent = getEmailTemplate(
        operator,
        result.tipe_disiplin.nama_tipe_disiplin,
        poinSetelahUpdate,
        alertType,
      );

      // Kirim email tanpa await agar tidak memperlambat respon API utama
      sendAlertEmail(recipient, subject, htmlContent);
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
      id: true, // WAJIB ADA agar targetUserIds tidak undefined
      current_point: true,
    },
  });

  const summary = {
    total_operator: users.length,
    aman: users.filter((u) => u.current_point >= 70).length,
    peringatan: users.filter(
      (u) => u.current_point >= 50 && u.current_point < 70,
    ).length,
    kritis: users.filter((u) => u.current_point < 50).length,
  };

  // Jika tidak ada user di plant tersebut, kembalikan response kosong lebih awal
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
  // Menggunakan groupBy yang sudah mendukung where clause
  const [shiftStatsRaw, topViolationsRaw, masterShift, masterTipe] =
    await Promise.all([
      // Group by Shift
      prisma.poinDisiplin.groupBy({
        by: ["fk_id_shift"],
        _count: { id: true },
        where: {
          fk_id_operator: { in: targetUserIds },
          ...dateFilter,
        },
      }),
      // Top Violations
      prisma.poinDisiplin.groupBy({
        by: ["fk_tipe_disiplin"],
        _count: { id: true },
        where: {
          fk_id_operator: { in: targetUserIds },
          ...dateFilter,
        },
        orderBy: { _count: { id: "desc" } },
        take: 4,
      }),
      // Master Data (Cached-like fetch)
      prisma.shift.findMany(),
      prisma.tipeDisiplin.findMany(),
    ]);

  // 4. Mapping Data
  const shift_stats = shiftStatsRaw.map((stat) => {
    const shiftInfo = masterShift.find((s) => s.id === stat.fk_id_shift);
    return {
      label: shiftInfo?.nama_shift || "Tanpa Shift",
      tipe_shift: shiftInfo?.tipe_shift || "N/A",
      value: stat._count.id,
    };
  });

  const top_violations = topViolationsRaw.map((v) => ({
    label:
      masterTipe.find((t) => t.id === v.fk_tipe_disiplin)?.nama_tipe_disiplin ||
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
      orderBy: { current_point: "asc" },
      take: 3,
      include: {
        _count: {
          select: { poin_disiplins_diterima: true },
        },
      },
    }),
    prisma.user.findMany({
      where: whereClause,
      orderBy: { current_point: "desc" },
      take: 3,
      include: {
        _count: {
          select: { poin_disiplins_diterima: true },
        },
      },
    }),
  ]);

  const formatUser = (user) => ({
    nama: user.nama,
    poin: user.current_point,
    total_pelanggaran: user._count?.poin_disiplins_diterima ?? 0,
    uid_nfc: user.uid_nfc, // Tambahan informasi untuk dashboard
  });

  return {
    worst: worstUsers.map(formatUser),
    best: bestUsers.map(formatUser),
  };
};

/**
 * Get discipline points history with pagination
 */
const getPoinHistory = async (filter, options) => {
  const { plant } = filter;
  const page = options.page || 1;
  const limit = options.limit || 10;
  const skip = (page - 1) * limit;

  // Build where clause for operators
  const operatorWhere = {
    role: "PRODUKSI",
    ...(plant && { plant: String(plant) }),
  };

  // Get operator IDs matching the filter
  const operators = await prisma.user.findMany({
    where: operatorWhere,
    select: { id: true },
  });

  const operatorIds = operators.map((op) => op.id);

  // If no operators found, return empty result
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

  // Fetch history with pagination
  const whereClause = {
    fk_id_operator: { in: operatorIds },
  };

  // Add date filtering if provided
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
            nama_shift: true,
          },
        },
        tipe_disiplin: {
          select: {
            nama_tipe_disiplin: true,
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

  // Transform data for cleaner response
  const transformedData = data.map((item) => ({
    id: item.id,
    nama_operator: item.operator.nama,
    plant: item.operator.plant,
    shift: item.shift?.nama_shift || "N/A",
    tipe_disiplin: item.tipe_disiplin.nama_tipe_disiplin,
    kategori: item.tipe_disiplin.kategori,
    poin_berubah: item.poin_berubah,
    status_level: item.status_level,
    tanggal: item.tanggal,
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

/**
 * Get weekly stats for discipline points (last 7 days)
 */
const getWeeklyStats = async (plant) => {
  const labels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const displayLabels = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  // Calculate date range (last 7 days)
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  // Build where clause for operators (same pattern as getPoinHistory)
  const operatorWhere = {
    role: "PRODUKSI",
    ...(plant && { plant: String(plant) }),
  };

  // Get operator IDs matching the filter
  const operators = await prisma.user.findMany({
    where: operatorWhere,
    select: { id: true },
  });

  const operatorIds = operators.map((op) => op.id);

  // If no operators found, return empty stats
  if (operatorIds.length === 0) {
    return {
      labels: displayLabels,
      series: [
        { name: "Pelanggaran", data: [0, 0, 0, 0, 0, 0, 0] },
        { name: "Penghargaan", data: [0, 0, 0, 0, 0, 0, 0] },
      ],
    };
  }

  // Fetch data
  const data = await prisma.poinDisiplin.findMany({
    where: {
      tanggal: {
        gte: sevenDaysAgo,
        lte: today,
      },
      fk_id_operator: { in: operatorIds },
    },
    include: {
      tipe_disiplin: true,
    },
  });

  // Initialize result structure
  const statsMap = {};
  // Fill all 7 days with 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(sevenDaysAgo.getDate() + i);

    // Use local YYYY-MM-DD format to match data
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const dayLabel = labels[d.getDay()];
    statsMap[dateStr] = {
      label: dayLabel,
      pelanggaran: 0,
      penghargaan: 0,
    };
  }

  // Aggregate data
  data.forEach((item) => {
    // Use local YYYY-MM-DD format
    const d = new Date(item.tanggal);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    if (statsMap[dateStr]) {
      const kategori = item.tipe_disiplin.kategori;
      if (kategori === "PELANGGARAN") {
        statsMap[dateStr].pelanggaran++;
      } else if (kategori === "PENGHARGAAN") {
        statsMap[dateStr].penghargaan++;
      }
    }
  });

  // Sort and format for response
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

/**
 * Get monthly stats for discipline points (last 12 months)
 */
const getMonthlyStats = async (plant) => {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];

  const today = new Date();
  const currentYear = today.getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  // Build where clause for operators (same pattern as getWeeklyStats)
  const operatorWhere = {
    role: "PRODUKSI",
    ...(plant && { plant: String(plant) }),
  };

  // Get operator IDs matching the filter
  const operators = await prisma.user.findMany({
    where: operatorWhere,
    select: { id: true },
  });

  const operatorIds = operators.map((op) => op.id);

  // If no operators found, return empty stats
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

  // Fetch data for the current year
  const data = await prisma.poinDisiplin.findMany({
    where: {
      tanggal: {
        gte: startOfYear,
        lte: endOfYear,
      },
      fk_id_operator: { in: operatorIds },
    },
    include: {
      tipe_disiplin: true,
    },
  });

  // Generate January to December list
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

  // Aggregate data
  data.forEach((item) => {
    const itemDate = new Date(item.tanggal);
    const itemMonth = itemDate.getMonth();

    const monthData = months[itemMonth];
    if (monthData) {
      const kategori = item.tipe_disiplin.kategori;
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

/**
 * Get user by NFC for discipline preview
 */
const getUserByNfc = async (uid_nfc) => {
  const user = await prisma.user.findUnique({
    where: { uid_nfc },
    include: {
      divisi: {
        select: {
          id: true,
          nama_divisi: true,
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

  // Check suspension
  if (user.suspended_until && new Date(user.suspended_until) > new Date()) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `User sedang di-suspend hingga ${user.suspended_until.toLocaleString()}`,
    );
  }

  // Remove sensitive data
  const { password, ...safeUser } = user;
  return safeUser;
};

/**
 * Record violation using NFC
 */
const createPelanggaranByNfc = async (payload, staffId) => {
  const { uid_nfc, fk_tipe_disiplin, fk_id_shift, keterangan } = payload;

  const operator = await prisma.user.findUnique({
    where: { uid_nfc },
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

  // Check suspension
  if (
    operator.suspended_until &&
    new Date(operator.suspended_until) > new Date()
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Operator sedang dalam masa suspend",
    );
  }

  // Delegate to existing logic by preparing payload with fk_id_operator
  const enrichedPayload = {
    fk_id_operator: operator.id,
    fk_tipe_disiplin,
    fk_id_shift,
    keterangan,
  };

  return createPelanggaran(enrichedPayload, staffId);
};

export default {
  getFormData,
  getUserCurrentPoin,
  createPelanggaran,
  getPoinDashboardStats,
  getPoinRankings,
  getPoinHistory,
  getWeeklyStats,
  getMonthlyStats,
  getUserByNfc,
  createPelanggaranByNfc,
};
