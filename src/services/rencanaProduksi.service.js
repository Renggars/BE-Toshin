// src/service/rencanaProduksi.service.js

import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";
import moment from "moment";
import { nowWIB } from "../utils/dateWIB.js";

import prisma from "../../prisma/index.js";
import { calculateProductionTarget } from "../utils/productionCalc.js";
import notificationService from "./notification.service.js";

const createRencanaProduksi = async (payload) => {
  const {
    userId,
    mesinId,
    produkId,
    shiftId,
    targetId,
    jenisPekerjaanId,
    tanggal,
    keterangan,
  } = payload;

  // 1. Validasi foreign key (Mencoba ambil target dulu untuk auto-derive jenis_pekerjaan jika tidak ada)
  const targetCheck = await prisma.target.findUnique({
    where: { id: targetId },
  });

  const effectiveJenisPekerjaanId =
    jenisPekerjaanId || targetCheck?.jenisPekerjaanId;

  const [user, mesin, produk, shift, target, jenisPekerjaan] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { divisi: true },
      }),
      prisma.mesin.findUnique({ where: { id: mesinId } }),
      prisma.produk.findUnique({ where: { id: produkId } }),
      prisma.shift.findUnique({ where: { id: shiftId } }),
      prisma.target.findUnique({ where: { id: targetId } }),
      prisma.jenisPekerjaan.findUnique({
        where: { id: effectiveJenisPekerjaanId || 0 },
      }),
    ]);

  if (!user || !mesin || !produk || !shift || !target || !jenisPekerjaan) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Data relasi tidak valid (user/mesin/produk/shift/target/jenis_pekerjaan)",
    );
  }

  // 2. Multi-RPH per shift diperbolehkan.
  // RPH baru akan berstatus PLANNED secara default sesuai schema.

  // 3. Simpan rencana produksi (Tanpa field lembur sesuai schema baru)
  const rph = await prisma.rencanaProduksi.create({
    data: {
      userId: userId,
      mesinId: mesinId,
      produkId: produkId,
      shiftId: shiftId,
      targetId: targetId,
      jenisPekerjaanId: effectiveJenisPekerjaanId,
      tanggal: new Date(tanggal),
      keterangan,
    },
    include: {
      operator: { include: { divisi: true } },
      mesin: true,
      produk: true,
      shift: true,
      jenisPekerjaan: true,
      target: { include: { jenisPekerjaan: true } },
    },
  });

  //kirim notifikasi ke user yang di assign
  await notificationService.createNotification({
    userId: userId,
    tipe: "RPH_ASSIGNED",
    judul: "RPH Baru Ditugaskan",
    pesan: `RPH baru telah ditambahkan pada ${moment().format(
      "DD-MM-YYYY HH:mm",
    )}`,
  });

  return rph;
};

/**
 * Mendapatkan rencana produksi harian untuk operator tertentu
 * @param {number} userId
 * @param {string} tanggal - format YYYY-MM-DD
 */
const getRencanaProduksiHarian = async (userId, tanggalStr) => {
  const startOfDay = moment(tanggalStr).startOf("day").toDate();
  const endOfDay = moment(tanggalStr).endOf("day").toDate();

  const includeQuery = {
    operator: {
      include: {
        poinDisiplinOperator: {
          take: 3,
          orderBy: { tanggal: "desc" },
          include: {
            tipeDisiplin: true,
            staff: { select: { nama: true } },
          },
        },
      },
    },
    mesin: true,
    produk: true,
    shift: true,
    target: {
      include: { jenisPekerjaan: true },
    },
    attendance: {
      take: 1,
      orderBy: { jamTap: "asc" },
    },
  };

  // Find all RPHs for this user today
  let allRphs = await prisma.rencanaProduksi.findMany({
    where: {
      userId: userId,
      tanggal: { gte: startOfDay, lte: endOfDay },
    },
    include: includeQuery,
    orderBy: { id: "asc" },
  });

  // ✅ Fallback: Jika tidak ada RPH hari ini, cek kemarin (siapa tahu shift malam belum selesai)
  if (allRphs.length === 0) {
    const yesterdayStart = moment(tanggalStr)
      .subtract(1, "days")
      .startOf("day")
      .toDate();
    const yesterdayEnd = moment(tanggalStr)
      .subtract(1, "days")
      .endOf("day")
      .toDate();

    allRphs = await prisma.rencanaProduksi.findMany({
      where: {
        userId: userId,
        tanggal: { gte: yesterdayStart, lte: yesterdayEnd },
        status: { in: ["ACTIVE", "PLANNED"] }, // Hanya ambil yang masih relevan
      },
      include: includeQuery,
      orderBy: { id: "asc" },
    });
  }

  if (allRphs.length === 0) return null;

  // ✅ Auto-activation logic: If no ACTIVE RPH, but there are PLANNED ones, activate the most recent PLANNED.
  let rp = [...allRphs].reverse().find((r) => r.status === "ACTIVE");

  if (!rp) {
    const plannedRph = [...allRphs]
      .reverse()
      .find((r) => r.status === "PLANNED");
    if (plannedRph) {
      // Update status to ACTIVE in database
      await prisma.rencanaProduksi.update({
        where: { id: plannedRph.id },
        data: { status: "ACTIVE", startTime: nowWIB() },
      });
      plannedRph.status = "ACTIVE"; // Update object in memory
      plannedRph.startTime = nowWIB();
      rp = plannedRph;
    }
  }

  // If still no RPH found (shouldn't happen due to early return), fallback to the latest
  if (!rp) rp = allRphs[allRphs.length - 1];

  const logPoin =
    rp.user?.poinDisiplinOperator.map((log) => ({
      tanggal: log.tanggal,
      perubahan_poin: log.poinBerubah,
      nama_pelanggaran: log.tipeDisiplin.namaTipeDisiplin,
      kategori: log.tipeDisiplin.kategori,
      status_level: log.statusLevel,
    })) || [];

  // Hitung Absensi: Cari tap paling awal dari semua RPH hari ini
  const allAttendances = allRphs.flatMap((r) => r.attendance);
  const firstAttendance =
    allAttendances.length > 0
      ? [...allAttendances].sort(
          (a, b) => new Date(a.jamTap) - new Date(b.jamTap),
        )[0]
      : null;

  let statusAbsensi = "Belum Hadir";
  let jamMasukAktual = "-";
  let isTerlambat = false;
  let selisihWaktu = "-";

  if (firstAttendance) {
    const jamTap = new Date(firstAttendance.jamTap);
    const jamMasukShift = rp.shift.jamMasuk;

    const [h, m] = jamMasukShift.split(":");
    const shiftTime = new Date(jamTap);
    shiftTime.setHours(parseInt(h), parseInt(m), 0, 0);

    jamMasukAktual = moment(jamTap).format("HH:mm");

    if (jamTap > shiftTime) {
      statusAbsensi = "Terlambat";
      isTerlambat = true;
      const diffMs = jamTap - shiftTime;
      const diffMins = Math.floor(diffMs / 60000);
      selisihWaktu = `${diffMins} menit`;
    } else {
      statusAbsensi = "Tepat Waktu";
      isTerlambat = false;
    }
  }

  const targetKalkulasi = calculateProductionTarget(
    rp.target.totalTarget,
    rp.shift.tipeShift,
  );

  // ✅ Context Detection: Active Andon RPH Switch
  const RPH_SWITCH_NAMES = [
    "Pindah Mesin",
    "Pindah Produk",
    "Pindah Jenis Pekerjaan",
  ];
  const activeAndonSwitch = await prisma.andonEvent.findFirst({
    where: {
      mesinId: rp.mesinId,
      status: "ACTIVE",
      masterMasalahAndon: {
        kategori: "PLAN_DOWNTIME",
        namaMasalah: { in: RPH_SWITCH_NAMES },
      },
    },
    include: { masterMasalahAndon: true },
  });

  let andonStatus = "IDLE";
  let isLate = false;
  let lateMinutes = 0;

  if (activeAndonSwitch) {
    andonStatus = "RPH_SWITCH_IN_PROGRESS";
    const durationMs = nowWIB() - new Date(activeAndonSwitch.waktuTrigger);
    const standardMin = activeAndonSwitch.masterMasalahAndon?.waktuPerbaikanMenit || 0;

    // Real decimal minutes (2 decimal precision)
    const totalDurationMinutes = Number((durationMs / 60000).toFixed(2));

    if (standardMin > 0 && totalDurationMinutes > standardMin) {
      isLate = true;
      lateMinutes = Number((totalDurationMinutes - standardMin).toFixed(2));
    }
  }

  const pendingRph = [...allRphs].find((r) => r.status === "PLANNED");

  return {
    user: {
      log_disiplin: logPoin,
    },
    absensi: {
      status: statusAbsensi,
      jam_masuk_shift: rp.shift.jam_masuk,
      jam_masuk_aktual: jamMasukAktual,
      terlambat: isTerlambat,
      keterangan: isTerlambat ? `Telat ${selisihWaktu}` : "On Time",
    },
    produksi: {
      fk_id_rph: rp.id,
      fk_id_mesin: rp.mesinId,
      fk_id_produk: rp.produkId,
      fk_id_jenis_pekerjaan:
        rp.jenisPekerjaanId || rp.target.jenisPekerjaanId,
      mesin: rp.mesin.namaMesin,
      produk: rp.produk.namaProduk,
      jenis_pekerjaan: rp.target.jenisPekerjaan.namaPekerjaan,
      status_rph: rp.status,
      catatan: rp.keterangan || "Tidak ada catatan untuk hari ini",
    },
    shift_detail: {
      fk_id_shift: rp.shiftId,
      nama_shift: rp.shift.namaShift,
      tipe_shift: rp.shift.tipeShift,
      jam_masuk: rp.shift.jamMasuk,
      jam_keluar: rp.shift.jamKeluar,
    },
    target_kalkulasi: {
      target_normal: targetKalkulasi.targetNormal,
      target_lembur: targetKalkulasi.targetLembur,
      total_target: targetKalkulasi.totalTarget,
    },
    rph_list: allRphs.map((r) => ({
      id: r.id,
      status: r.status,
      produk: r.produk.namaProduk,
      mesin: r.mesin.namaMesin,
      target: r.target.totalTarget,
    })),
    context: {
      andon_status: andonStatus,
      is_late: isLate,
      late_menit: lateMinutes,
      pending_rph: pendingRph
        ? {
            id: pendingRph.id,
            fk_id_mesin: pendingRph.mesinId,
            fk_id_produk: pendingRph.produkId,
            fk_id_jenis_pekerjaan:
              pendingRph.jenisPekerjaanId ||
              pendingRph.target?.jenisPekerjaanId,
            produk: pendingRph.produk.namaProduk,
            mesin: pendingRph.mesin.namaMesin,
          }
        : null,
    },
  };
};

const getDashboardSummary = async (filterTanggal) => {
  // 1. Tentukan rentang waktu berdasarkan filter tanggal (default: hari ini)
  const dateStr = filterTanggal || moment().format("YYYY-MM-DD");
  const targetDate = moment(dateStr);

  const startOfDay = targetDate.clone().startOf("day").toDate();
  const endOfDay = targetDate.clone().endOf("day").toDate();

  // 2. Ambil data Rencana Produksi Harian (RPH) - hanya field yang diperlukan
  const rphToday = await prisma.rencanaProduksi.findMany({
    where: {
      tanggal: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    select: {
      shiftId: true,
      target: {
        select: {
          totalTarget: true,
        },
      },
    },
  });

  // 3. Hitung Total Target Harian menggunakan Agregasi DB (Widget Kiri Atas)
  const rphAggregation = await prisma.rencanaProduksi.aggregate({
    where: {
      tanggal: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    _sum: {
      targetId: true, // Kita perlu totalTarget, tapi karena totalTarget ada di relasi Target,
      // Jika skema mengizinkan, kita bisa join, tapi untuk saat ini kita tetap pakai rphToday
      // atau jika ingin benar-benar efisien, kita ambil sum totalTarget dari relasi.
    },
  });

  // Karena total_target ada di tabel Target, kita tetap butuh RPH data atau join.
  // Untuk efisiensi tanpa merubah skema jauh-jauh, ide grouping Anda di memory sudah sangat bagus.
  // Tapi mari kita gunakan pendekatan yang lebih "clean".

  const totalTarget = rphToday.reduce(
    (acc, curr) => acc + (curr.target?.totalTarget || 0),
    0,
  );

  // Ambil data produksi aktual dari LRP menggunakan GroupBy DB
  const lrpStatsGroup = await prisma.laporanRealisasiProduksi.groupBy({
    by: ["shiftId"],
    where: {
      tanggal: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    _sum: {
      qtyTotalProd: true,
    },
  });

  // Hitung total tercapai harian dari agregasi LRP
  const totalTercapai = lrpStatsGroup.reduce(
    (acc, curr) => acc + (curr._sum.qtyTotalProd || 0),
    0,
  );

  const persentaseTotal =
    totalTarget > 0
      ? parseFloat(((totalTercapai / totalTarget) * 100).toFixed(1))
      : 0;

  // 4. Hitung Statistik Operator (Widget Tengah Atas)
  const totalOperator = await prisma.user.count({
    where: { role: "PRODUKSI" },
  });

  // Perbaikan error 'distinct': Gunakan groupBy untuk menghitung operator unik yang tap absensi
  const aktifOperatorGroup = await prisma.attendance.groupBy({
    by: ["userId"],
    where: {
      tanggal: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });
  const totalAktif = aktifOperatorGroup.length;

  // 5. Hitung Progress per Shift (Widget Tengah) - hanya field yang diperlukan
  // Optimasi: Grouping di memory untuk menghindari O(N*M) query
  const allShifts = await prisma.shift.findMany({
    select: {
      id: true,
      namaShift: true,
      tipeShift: true,
      jamMasuk: true,
      jamKeluar: true,
    },
  });

  // Group RPH by Shift (Target)
  const rphByShift = {};
  rphToday.forEach((r) => {
    rphByShift[r.shiftId] =
      (rphByShift[r.shiftId] || 0) + (r.target?.totalTarget || 0);
  });

  // Group LRP by Shift (Tercapai) - ambil dari lrpStatsGroup yang sudah di-query sebelumnya
  const lrpByShift = {};
  lrpStatsGroup.forEach((l) => {
    lrpByShift[l.shiftId] =
      (lrpByShift[l.shiftId] || 0) + (l._sum.qtyTotalProd || 0);
  });

  const shiftStats = allShifts.map((s) => {
    const target = rphByShift[s.id] || 0;
    const tercapai = lrpByShift[s.id] || 0;

    return {
      id: s.id,
      nama: s.namaShift,
      type: s.tipeShift,
      jam: `${s.jamMasuk} - ${s.jamKeluar}`,
      target,
      tercapai,
      persentase:
        target > 0 ? parseFloat(((tercapai / target) * 100).toFixed(1)) : 0,
    };
  });

  // 6. Hitung Tren Produksi Mingguan (7 hari ke belakang dari tanggal filter)
  const weekStart = targetDate
    .clone()
    .subtract(6, "days")
    .startOf("day")
    .toDate();
  const weekEnd = targetDate.clone().endOf("day").toDate();

  const weeklyData = await prisma.rencanaProduksi.findMany({
    where: {
      tanggal: {
        gte: weekStart,
        lte: weekEnd,
      },
    },
    select: {
      tanggal: true,
      target: {
        select: {
          totalTarget: true,
        },
      },
    },
  });

  // Ambil data LRP mingguan untuk tercapai aktual
  const weeklyLrpData = await prisma.laporanRealisasiProduksi.findMany({
    where: {
      tanggal: {
        gte: weekStart,
        lte: weekEnd,
      },
    },
    select: {
      tanggal: true,
      qtyTotalProd: true,
    },
  });

  // Group data by date
  const trendByDate = {};
  for (let i = 0; i < 7; i++) {
    const date = targetDate
      .clone()
      .subtract(6 - i, "days")
      .format("YYYY-MM-DD");
    trendByDate[date] = {
      tanggal: date,
      target: 0,
      tercapai: 0,
    };
  }

  // Aggregate target dari RPH
  weeklyData.forEach((rph) => {
    const dateKey = moment(rph.tanggal).format("YYYY-MM-DD");
    if (trendByDate[dateKey]) {
      trendByDate[dateKey].target += rph.target?.totalTarget || 0;
    }
  });

  // Aggregate tercapai dari LRP aktual
  weeklyLrpData.forEach((lrp) => {
    const dateKey = moment(lrp.tanggal).format("YYYY-MM-DD");
    if (trendByDate[dateKey]) {
      trendByDate[dateKey].tercapai += lrp.qtyTotalProd || 0;
    }
  });

  const trendProduksiMingguan = Object.values(trendByDate);

  // 7. Return format yang sesuai dengan kebutuhan Frontend Dashboard
  return {
    summary: {
      target_harian: totalTarget,
      tercapai: totalTercapai,
      persentase: persentaseTotal,
    },
    operator: {
      total: totalOperator,
      aktif: totalAktif,
      label: `${totalAktif} operator`,
    },
    shift_details: shiftStats,
    trend_produksi_mingguan: trendProduksiMingguan,
  };
};

const getWeeklyTrend = async () => {
  // 1. Tentukan rentang waktu 7 hari ke belakang dari hari ini
  const targetDate = moment();
  const weekStart = targetDate.clone().subtract(6, "days").startOf("day").toDate();
  const weekEnd = targetDate.clone().endOf("day").toDate();

  // 2. Ambil data Rencana Produksi (Target)
  const weeklyRph = await prisma.rencanaProduksi.findMany({
    where: {
      tanggal: { gte: weekStart, lte: weekEnd },
    },
    select: {
      tanggal: true,
      target: {
        select: { totalTarget: true },
      },
    },
  });

  // 3. Ambil data LRP (Aktual)
  const weeklyLrp = await prisma.laporanRealisasiProduksi.findMany({
    where: {
      tanggal: { gte: weekStart, lte: weekEnd },
    },
    select: {
      tanggal: true,
      qtyTotalProd: true,
    },
  });

  // 4. Inisialisasi map untuk 7 hari terakhir
  const trendMap = {};
  for (let i = 0; i < 7; i++) {
    const dateStr = targetDate.clone().subtract(6 - i, "days").format("YYYY-MM-DD");
    trendMap[dateStr] = {
      date: dateStr,
      totalProduction: 0,
      totalTarget: 0,
      percentage: 0,
    };
  }

  // 5. Agregasi target dari RPH
  weeklyRph.forEach((rph) => {
    const dateKey = moment(rph.tanggal).format("YYYY-MM-DD");
    if (trendMap[dateKey]) {
      trendMap[dateKey].totalTarget += rph.target?.totalTarget || 0;
    }
  });

  // 6. Agregasi aktual dari LRP
  weeklyLrp.forEach((lrp) => {
    const dateKey = moment(lrp.tanggal).format("YYYY-MM-DD");
    if (trendMap[dateKey]) {
      trendMap[dateKey].totalProduction += lrp.qtyTotalProd || 0;
    }
  });

  // 7. Hitung persentase
  const results = Object.values(trendMap).map((item) => {
    return {
      ...item,
      percentage: item.totalTarget > 0 
        ? parseFloat(((item.totalProduction / item.totalTarget) * 100).toFixed(1))
        : 0,
    };
  });

  return results;
};

const searchOperator = async (query) => {
  return prisma.user.findFirst({
    where: {
      OR: [{ nama: { contains: query } }, { uidNfc: query }],
      role: "PRODUKSI",
    },
    select: {
      id: true,
      nama: true,
      currentPoint: true, // Untuk kolom "Total Poin"
      divisi: { select: { namaDivisi: true } }, // Untuk kolom "Divisi"
    },
  });
};

const getHistoryRPH = async (filterTanggal) => {
  // Gunakan string YYYY-MM-DD agar diparse sebagai UTC 00:00 oleh new Date()
  const dateStr = filterTanggal || moment().format("YYYY-MM-DD");
  const date = new Date(dateStr);

  const where = {
    tanggal: date,
  };

  // Mengambil data untuk widget "Data RPH"
  const data = await prisma.rencanaProduksi.findMany({
    where,
    include: {
      operator: { select: { nama: true } },
      mesin: { select: { namaMesin: true } },
      produk: { select: { namaProduk: true } },
      shift: { select: { namaShift: true, tipeShift: true } },
      target: { select: { totalTarget: true } },
    },
    orderBy: { tanggal: "desc" },
  });

  // Map data ke format yang diinginkan
  const result = data.map((curr) => {
    const targetKalkulasi = calculateProductionTarget(
      curr.target?.totalTarget || 0,
      curr.shift?.tipeShift || "Normal",
    );

    return {
      nama: curr.operator?.nama || "-",
      detail: `${curr.mesin?.namaMesin || "-"} • ${curr.produk?.namaProduk || "-"}`,
      shift: curr.shift?.namaShift || "-",
      kategori_shift: curr.shift?.tipeShift || "-",
      target: targetKalkulasi.totalTarget,
    };
  });

  return {
    tanggal: dateStr,
    data: result,
  };
};

const updateRencanaProduksi = async (rphId, payload) => {
  const rph = await prisma.rencanaProduksi.findUnique({
    where: { id: rphId },
  });

  if (!rph) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Rencana Produksi tidak ditemukan",
    );
  }

  // Jika ada perubahan user, kirim notifikasi ke user baru
  if (payload.userId && payload.userId !== rph.userId) {
    await notificationService.createNotification({
      userId: payload.userId,
      tipe: "RPH_ASSIGNED",
      judul: "RPH Baru Ditugaskan",
      pesan: `RPH baru telah ditugaskan kepada Anda pada ${moment().format(
        "DD-MM-YYYY HH:mm",
      )} (Update)`,
    });
  }

  const updatedRph = await prisma.rencanaProduksi.update({
    where: { id: rphId },
    data: {
      userId: payload.userId || undefined,
      mesinId: payload.mesinId || undefined,
      produkId: payload.produkId || undefined,
      shiftId: payload.shiftId || undefined,
      targetId: payload.targetId || undefined,
      jenisPekerjaanId: payload.jenisPekerjaanId || undefined,
      keterangan: payload.keterangan || undefined,
      tanggal: payload.tanggal ? new Date(payload.tanggal) : undefined,
    },
    include: {
      operator: { include: { divisi: true } },
      mesin: true,
      produk: true,
      shift: true,
      jenisPekerjaan: true,
      target: { include: { jenisPekerjaan: true } },
    },
  });

  return updatedRph;
};

const deleteRencanaProduksi = async (rphId) => {
  const rph = await prisma.rencanaProduksi.findUnique({
    where: { id: rphId },
    include: {
      _count: {
        select: {
          attendance: true,
          laporanRealisasiProduksi: true,
        },
      },
    },
  });

  if (!rph) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Rencana Produksi tidak ditemukan",
    );
  }

  if (rph._count.laporanRealisasiProduksi > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Gagal menghapus! RPH ini sudah memiliki Laporan Realisasi Produksi (LRP). Hapus LRP terlebih dahulu jika ingin menghapus RPH ini.",
    );
  }

  if (rph._count.attendance > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Gagal menghapus! Sudah ada data absensi untuk RPH ini. Silakan hapus data absensi terlebih dahulu jika diperlukan.",
    );
  }

  await prisma.rencanaProduksi.delete({
    where: { id: rphId },
  });

  return true;
};

const getUserRPHList = async (userId, tanggalStr) => {
  const startOfDay = moment(tanggalStr).startOf("day").toDate();
  const endOfDay = moment(tanggalStr).endOf("day").toDate();

  const includeQuery = {
    mesin: true,
    produk: true,
    jenisPekerjaan: true,
    target: {
      include: { jenisPekerjaan: true },
    },
  };

  // Find all RPHs for this user today
  let allRphs = await prisma.rencanaProduksi.findMany({
    where: {
      userId: userId,
      tanggal: { gte: startOfDay, lte: endOfDay },
    },
    include: includeQuery,
    orderBy: { id: "asc" },
  });

  // ✅ Fallback: Jika tidak ada RPH hari ini, cek kemarin (shift malam)
  if (allRphs.length === 0) {
    const yesterdayStart = moment(tanggalStr)
      .subtract(1, "days")
      .startOf("day")
      .toDate();
    const yesterdayEnd = moment(tanggalStr)
      .subtract(1, "days")
      .endOf("day")
      .toDate();

    allRphs = await prisma.rencanaProduksi.findMany({
      where: {
        userId: userId,
        tanggal: { gte: yesterdayStart, lte: yesterdayEnd },
        status: { in: ["ACTIVE", "PLANNED"] },
      },
      include: includeQuery,
      orderBy: { id: "asc" },
    });
  }

  // ✅ Auto-activation: Sama seperti di dashboard, aktifkan PLANNED jika tidak ada ACTIVE
  const hasActive = allRphs.some((r) => r.status === "ACTIVE");
  if (!hasActive) {
    const plannedIdx = [...allRphs]
      .reverse()
      .findIndex((r) => r.status === "PLANNED");
    if (plannedIdx !== -1) {
      const idx = allRphs.length - 1 - plannedIdx;
      await prisma.rencanaProduksi.update({
        where: { id: allRphs[idx].id },
        data: { status: "ACTIVE", startTime: nowWIB() },
      });
      allRphs[idx].status = "ACTIVE";
      allRphs[idx].startTime = nowWIB();
    }
  }

  // Map to detailed format requested by user
  return allRphs.map((r) => ({
    id: r.id,
    status: r.status,
    tanggal: moment(r.tanggal).format("YYYY-MM-DD"),
    keterangan: r.keterangan,
    mesin: {
      id: r.mesin.id,
      nama: r.mesin.namaMesin,
    },
    produk: {
      id: r.produk.id,
      nama: r.produk.namaProduk,
    },
    jenis_pekerjaan: {
      id: r.jenisPekerjaan?.id || r.target.jenisPekerjaanId,
      nama:
        r.jenisPekerjaan?.namaPekerjaan ||
        r.target.jenisPekerjaan.namaPekerjaan,
    },
    target: {
      id: r.target.id,
      total_target: r.target.totalTarget,
    },
  }));
};

const closeRph = async (rphId) => {
  const rph = await prisma.rencanaProduksi.findUnique({
    where: {
      id: rphId,
    },
  });

  if (!rph) {
    throw new ApiError(httpStatus.NOT_FOUND, "RPH tidak ditemukan");
  }

  if (rph.status !== "ACTIVE") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Hanya RPH dengan status ACTIVE yang dapat ditutup",
    );
  }

  const updatedRph = await prisma.rencanaProduksi.update({
    where: { id: rphId },
    data: {
      status: "CLOSED",
      endTime: nowWIB(),
    },
  });

  return updatedRph;
};

export default {
  createRencanaProduksi,
  getRencanaProduksiHarian,
  getUserRPHList,
  getDashboardSummary,
  getWeeklyTrend,
  searchOperator,
  getHistoryRPH,
  updateRencanaProduksi,
  deleteRencanaProduksi,
  closeRph,
};
