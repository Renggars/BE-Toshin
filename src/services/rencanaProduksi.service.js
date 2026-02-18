// src/service/rencanaProduksi.service.js

import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";
import moment from "moment";

import prisma from "../../prisma/index.js";
import { calculateProductionTarget } from "../utils/productionCalc.js";
import notificationService from "./notification.service.js";

const createRencanaProduksi = async (payload) => {
  const {
    fk_id_user,
    fk_id_mesin,
    fk_id_produk,
    fk_id_shift,
    fk_id_target,
    fk_id_jenis_pekerjaan,
    tanggal,
    keterangan,
  } = payload;

  // 1. Validasi foreign key (Mencoba ambil target dulu untuk auto-derive jenis_pekerjaan jika tidak ada)
  const targetCheck = await prisma.target.findUnique({
    where: { id: fk_id_target },
  });

  const effectiveJenisPekerjaanId =
    fk_id_jenis_pekerjaan || targetCheck?.fk_jenis_pekerjaan;

  const [user, mesin, produk, shift, target, jenisPekerjaan] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: fk_id_user },
        include: { divisi: true },
      }),
      prisma.mesin.findUnique({ where: { id: fk_id_mesin } }),
      prisma.produk.findUnique({ where: { id: fk_id_produk } }),
      prisma.shift.findUnique({ where: { id: fk_id_shift } }),
      prisma.target.findUnique({ where: { id: fk_id_target } }),
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
      fk_id_user,
      fk_id_mesin,
      fk_id_produk,
      fk_id_shift,
      fk_id_target,
      fk_id_jenis_pekerjaan: effectiveJenisPekerjaanId,
      tanggal: new Date(tanggal),
      keterangan,
    },
    include: {
      user: { include: { divisi: true } },
      mesin: true,
      produk: true,
      shift: true,
      jenis_pekerjaan: true,
      target: { include: { jenis_pekerjaan: true } },
    },
  });

  //kirim notifikasi ke user yang di assign
  await notificationService.createNotification({
    fk_id_user: fk_id_user,
    tipe: "RPH_ASSIGNED",
    judul: "RPH Baru Ditugaskan",
    pesan: `RPH baru telah ditambahkan pada ${moment().format("DD-MM-YYYY HH:mm")}`,
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
    user: {
      include: {
        poin_disiplins_diterima: {
          take: 3,
          orderBy: { tanggal: "desc" },
          include: {
            tipe_disiplin: true,
            staff: { select: { nama: true } },
          },
        },
      },
    },
    mesin: true,
    produk: true,
    shift: true,
    target: {
      include: { jenis_pekerjaan: true },
    },
    attendances: {
      take: 1,
      orderBy: { jam_tap: "asc" },
    },
  };

  // Find all RPHs for this user today
  let allRphs = await prisma.rencanaProduksi.findMany({
    where: {
      fk_id_user: userId,
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
        fk_id_user: userId,
        tanggal: { gte: yesterdayStart, lte: yesterdayEnd },
        status: { in: ["ACTIVE", "WAITING_START"] }, // Hanya ambil yang masih relevan
      },
      include: includeQuery,
      orderBy: { id: "asc" },
    });
  }

  if (allRphs.length === 0) return null;

  // Prioritize ACTIVE RPH, then WAITING_START, then PLANNED.
  // Gunakan ID terbesar (paling baru ditambahkan) untuk setiap kategori status.
  const rp =
    [...allRphs].reverse().find((r) => r.status === "ACTIVE") ||
    [...allRphs].reverse().find((r) => r.status === "WAITING_START") ||
    [...allRphs].reverse().find((r) => r.status === "PLANNED") ||
    allRphs[allRphs.length - 1];

  const logPoin =
    rp.user?.poin_disiplins_diterima.map((log) => ({
      tanggal: log.tanggal,
      perubahan_poin: log.poin_berubah,
      nama_pelanggaran: log.tipe_disiplin.nama_tipe_disiplin,
      kategori: log.tipe_disiplin.kategori,
      status_level: log.status_level,
    })) || [];

  // Hitung Absensi
  const attendance = rp.attendances[0] || null;
  let statusAbsensi = "Belum Hadir";
  let jamMasukAktual = "-";
  let isTerlambat = false;
  let selisihWaktu = "-";

  if (attendance) {
    const jamTap = new Date(attendance.jam_tap);
    const jamMasukShift = rp.shift.jam_masuk;

    const [h, m] = jamMasukShift.split(":");
    const shiftTime = new Date(attendance.jam_tap);
    shiftTime.setHours(parseInt(h), parseInt(m), 0, 0);

    jamMasukAktual = jamTap.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });

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
    rp.target.total_target,
    rp.shift.tipe_shift,
  );

  // ✅ Context Detection: Active Andon RPH Switch
  const RPH_SWITCH_NAMES = [
    "Pindah Mesin",
    "Pindah Produk",
    "Pindah Jenis Pekerjaan",
  ];
  const activeAndonSwitch = await prisma.andonEvent.findFirst({
    where: {
      fk_id_mesin: rp.fk_id_mesin,
      status: "ACTIVE",
      masalah: {
        kategori: "PLAN_DOWNTIME",
        nama_masalah: { in: RPH_SWITCH_NAMES },
      },
    },
    include: { masalah: true },
  });

  let andonStatus = "IDLE";
  let isLate = false;
  let lateMinutes = 0;

  if (activeAndonSwitch) {
    andonStatus = "RPH_SWITCH_IN_PROGRESS";
    const durationMs = new Date() - new Date(activeAndonSwitch.waktu_trigger);
    const standardMin = activeAndonSwitch.masalah?.waktu_perbaikan_menit || 0;

    // Real decimal minutes (2 decimal precision)
    const totalDurationMinutes = Number((durationMs / 60000).toFixed(2));

    if (standardMin > 0 && totalDurationMinutes > standardMin) {
      isLate = true;
      lateMinutes = Number((totalDurationMinutes - standardMin).toFixed(2));
    }
  }

  const pendingRph = [...allRphs]
    .reverse()
    .find((r) => r.status === "WAITING_START");

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
      fk_id_mesin: rp.fk_id_mesin,
      mesin: rp.mesin.nama_mesin,
      produk: rp.produk.nama_produk,
      jenis_pekerjaan: rp.target.jenis_pekerjaan.nama_pekerjaan,
      status_rph: rp.status,
      catatan: rp.keterangan || "Tidak ada catatan untuk hari ini",
    },
    shift_detail: {
      fk_id_shift: rp.fk_id_shift,
      nama_shift: rp.shift.nama_shift,
      tipe_shift: rp.shift.tipe_shift,
      jam_masuk: rp.shift.jam_masuk,
      jam_keluar: rp.shift.jam_keluar,
    },
    target_kalkulasi: {
      target_normal: targetKalkulasi.target_normal,
      target_lembur: targetKalkulasi.target_lembur,
      total_target: targetKalkulasi.total_target,
    },
    rph_list: allRphs.map((r) => ({
      id: r.id,
      status: r.status,
      produk: r.produk.nama_produk,
      mesin: r.mesin.nama_mesin,
      target: r.target.total_target,
    })),
    context: {
      andon_status: andonStatus,
      is_late: isLate,
      late_menit: lateMinutes,
      pending_rph: pendingRph
        ? {
          id: pendingRph.id,
          produk: pendingRph.produk.nama_produk,
          mesin: pendingRph.mesin.nama_mesin,
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
      fk_id_shift: true,
      target: {
        select: {
          total_target: true,
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
      fk_id_target: true, // Kita perlu total_target, tapi karena total_target ada di relasi Target,
      // Jika skema mengizinkan, kita bisa join, tapi untuk saat ini kita tetap pakai rphToday
      // atau jika ingin benar-benar efisien, kita ambil sum total_target dari relasi.
    },
  });

  // Karena total_target ada di tabel Target, kita tetap butuh RPH data atau join.
  // Untuk efisiensi tanpa merubah skema jauh-jauh, ide grouping Anda di memory sudah sangat bagus.
  // Tapi mari kita gunakan pendekatan yang lebih "clean".

  const totalTarget = rphToday.reduce(
    (acc, curr) => acc + (curr.target?.total_target || 0),
    0,
  );

  // Ambil data produksi aktual dari LRP menggunakan GroupBy DB
  const lrpStatsGroup = await prisma.laporanRealisasiProduksi.groupBy({
    by: ["fk_id_shift"],
    where: {
      tanggal: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    _sum: {
      qty_total_prod: true,
    },
  });

  // Hitung total tercapai harian dari agregasi LRP
  const totalTercapai = lrpStatsGroup.reduce(
    (acc, curr) => acc + (curr._sum.qty_total_prod || 0),
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
    by: ["fk_id_user"],
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
      nama_shift: true,
      jam_masuk: true,
      jam_keluar: true,
    },
  });

  // Group RPH by Shift (Target)
  const rphByShift = {};
  rphToday.forEach((r) => {
    rphByShift[r.fk_id_shift] =
      (rphByShift[r.fk_id_shift] || 0) + (r.target?.total_target || 0);
  });

  // Group LRP by Shift (Tercapai) - ambil dari lrpStatsGroup yang sudah di-query sebelumnya
  const lrpByShift = {};
  lrpStatsGroup.forEach((l) => {
    lrpByShift[l.fk_id_shift] =
      (lrpByShift[l.fk_id_shift] || 0) + (l._sum.qty_total_prod || 0);
  });

  const shiftStats = allShifts.map((s) => {
    const target = rphByShift[s.id] || 0;
    const tercapai = lrpByShift[s.id] || 0;

    return {
      id: s.id,
      nama: s.nama_shift,
      jam: `${s.jam_masuk} - ${s.jam_keluar}`,
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
          total_target: true,
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
      qty_total_prod: true,
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
      trendByDate[dateKey].target += rph.target?.total_target || 0;
    }
  });

  // Aggregate tercapai dari LRP aktual
  weeklyLrpData.forEach((lrp) => {
    const dateKey = moment(lrp.tanggal).format("YYYY-MM-DD");
    if (trendByDate[dateKey]) {
      trendByDate[dateKey].tercapai += lrp.qty_total_prod || 0;
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
  // Logic untuk mengambil data 7 hari terakhir dan memetakan ke array
  const startOfWeek = moment().startOf("week").toDate();
  const trendData = await prisma.rencanaProduksi.groupBy({
    by: ["tanggal"],
    _sum: { id: true }, // Simulasi hitung volume
    where: { tanggal: { gte: startOfWeek } },
  });
  return trendData;
};

const searchOperator = async (query) => {
  return prisma.user.findFirst({
    where: {
      OR: [{ nama: { contains: query } }, { uid_nfc: query }],
      role: "PRODUKSI",
    },
    select: {
      id: true,
      nama: true,
      current_point: true, // Untuk kolom "Total Poin"
      divisi: { select: { nama_divisi: true } }, // Untuk kolom "Divisi"
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
      user: { select: { nama: true } },
      mesin: { select: { nama_mesin: true } },
      produk: { select: { nama_produk: true } },
      shift: { select: { nama_shift: true, tipe_shift: true } },
      target: { select: { total_target: true } },
    },
    orderBy: { tanggal: "desc" },
  });

  // Map data ke format yang diinginkan
  const result = data.map((curr) => {
    const targetKalkulasi = calculateProductionTarget(
      curr.target?.total_target || 0,
      curr.shift?.tipe_shift || "Normal",
    );

    return {
      nama: curr.user.nama,
      detail: `${curr.mesin.nama_mesin} • ${curr.produk.nama_produk}`,
      shift: curr.shift.nama_shift,
      kategori_shift: curr.shift.tipe_shift,
      target: targetKalkulasi.total_target,
    };
  });

  return {
    tanggal: dateStr,
    data: result,
  };
};

export default {
  createRencanaProduksi,
  getRencanaProduksiHarian,
  getDashboardSummary,
  getWeeklyTrend,
  searchOperator,
  getHistoryRPH,
};
