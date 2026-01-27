// src/service/rencanaProduksi.service.js

import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";
import moment from "moment";

import prisma from "../../prisma/index.js";

const createRencanaProduksi = async (payload) => {
  const {
    fk_id_user,
    fk_id_mesin,
    fk_id_produk,
    fk_id_shift,
    fk_id_target,
    tanggal,
    keterangan,
  } = payload;

  // 1. Validasi foreign key
  const [user, mesin, produk, shift, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: fk_id_user },
      include: { divisi: true },
    }),
    prisma.mesin.findUnique({ where: { id: fk_id_mesin } }),
    prisma.produk.findUnique({ where: { id: fk_id_produk } }),
    prisma.shift.findUnique({ where: { id: fk_id_shift } }),
    prisma.target.findUnique({ where: { id: fk_id_target } }),
  ]);

  if (!user || !mesin || !produk || !shift || !target) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Data relasi tidak valid (user/mesin/produk/shift/target)",
    );
  }

  // 2. Cek apakah rph sudah ada untuk operator tersebut di tanggal yang sama
  const existingRph = await prisma.rencanaProduksi.findFirst({
    where: {
      fk_id_user,
      tanggal: new Date(tanggal),
    },
  });

  if (existingRph) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Rencana produksi untuk operator ini pada tanggal tersebut sudah ada",
    );
  }

  // 3. Simpan rencana produksi (Tanpa field lembur sesuai schema baru)
  return prisma.rencanaProduksi.create({
    data: {
      fk_id_user,
      fk_id_mesin,
      fk_id_produk,
      fk_id_shift,
      fk_id_target,
      tanggal: new Date(tanggal),
      keterangan,
    },
    include: {
      user: { include: { divisi: true } },
      mesin: true,
      produk: true,
      shift: true,
      target: { include: { jenis_pekerjaan: true } },
    },
  });
};
/**
 * Mendapatkan rencana produksi harian untuk operator tertentu
 * @param {number} userId
 * @param {string} tanggal - format YYYY-MM-DD
 */
const getRencanaProduksiHarian = async (userId, tanggalStr) => {
  const rp = await prisma.rencanaProduksi.findFirst({
    where: {
      fk_id_user: userId,
      tanggal: new Date(tanggalStr),
    },
    include: {
      mesin: true,
      produk: true,
      shift: true,
      target: {
        include: { jenis_pekerjaan: true },
      },
    },
  });

  if (!rp) return null;

  // 4. Logika Perhitungan Target Berdasarkan Tipe Shift
  let baseTarget = rp.target.total_target;
  let finalTarget = baseTarget;

  // Aturan: Long Shift +30%, Group +15%
  if (rp.shift.tipe_shift === "Long Shift") {
    finalTarget = Math.round(baseTarget * 1.3);
  } else if (rp.shift.tipe_shift === "Group") {
    finalTarget = Math.round(baseTarget * 1.15);
  }

  return {
    mesin: rp.mesin.nama_mesin,
    produk: rp.produk.nama_produk,
    shift: `${rp.shift.nama_shift} (${rp.shift.jam_masuk} - ${rp.shift.jam_keluar})`,
    tipe_shift: rp.shift.tipe_shift,
    target_database: baseTarget,
    total_target: finalTarget, // Target yang sudah dikalkulasi
    jenis_pekerjaan: rp.target.jenis_pekerjaan.nama_pekerjaan,
    catatan_produksi: rp.keterangan || "Tidak ada catatan untuk hari ini",
  };
};

const getDashboardSummary = async () => {
  // 1. Tentukan rentang waktu hari ini (Start & End of Day)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // 2. Ambil data Rencana Produksi Harian (RPH)
  const rphToday = await prisma.rencanaProduksi.findMany({
    where: {
      tanggal: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      target: true,
      shift: true,
    },
  });

  // 3. Hitung Total Target Harian (Widget Kiri Atas)
  const totalTarget = rphToday.reduce(
    (acc, curr) => acc + (curr.target?.total_target || 0),
    0,
  );

  // Simulasi angka tercapai (Idealnya dihitung dari aktual produksi/output mesin)
  const totalTercapai = rphToday.length > 0 ? 1195 : 0;
  const persentaseTotal =
    totalTarget > 0 ? Math.round((totalTercapai / totalTarget) * 100) : 0;

  // 4. Hitung Statistik Operator (Widget Tengah Atas)
  const totalOperator = await prisma.user.count({
    where: { role: "OPERATOR" },
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

  // 5. Hitung Progress per Shift (Widget Tengah)
  const allShifts = await prisma.shift.findMany();
  const shiftStats = allShifts.map((s) => {
    const rphInShift = rphToday.filter((r) => r.fk_id_shift === s.id);
    const targetShift = rphInShift.reduce(
      (acc, curr) => acc + (curr.target?.total_target || 0),
      0,
    );

    // Simulasi data tercapai per shift sesuai gambar dashboard
    let tercapaiShift = 0;
    if (s.nama_shift.includes("1")) tercapaiShift = 420;
    else if (s.nama_shift.includes("2")) tercapaiShift = 465;
    else if (s.nama_shift.includes("3")) tercapaiShift = 310;

    return {
      id: s.id,
      nama: s.nama_shift,
      jam: `${s.jam_masuk} - ${s.jam_keluar}`,
      target: targetShift,
      tercapai: tercapaiShift,
      persentase:
        targetShift > 0 ? Math.round((tercapaiShift / targetShift) * 100) : 0,
    };
  });

  // 6. Return format yang sesuai dengan kebutuhan Frontend Dashboard
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
    // Trend statis sesuai gambar (+5.2%)
    trend_mingguan: "+5.2%",
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
      role: "OPERATOR",
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
  const where = filterTanggal ? { tanggal: new Date(filterTanggal) } : {};

  // Mengambil data untuk widget "Data RPH"
  const data = await prisma.rencanaProduksi.findMany({
    where,
    include: {
      user: { select: { nama: true } },
      mesin: { select: { nama_mesin: true } },
      produk: { select: { nama_produk: true } },
      shift: { select: { nama_shift: true } },
    },
    orderBy: { tanggal: "desc" },
    take: 10, // Ambil 10 data terbaru
  });

  // Mengelompokkan data berdasarkan tanggal untuk UI
  const grouped = data.reduce((acc, curr) => {
    const dateKey = curr.tanggal.toISOString().split("T")[0];
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push({
      nama: curr.user.nama,
      detail: `${curr.mesin.nama_mesin} • ${curr.produk.nama_produk}`,
      shift: curr.shift.nama_shift,
      target: 150, // Contoh field target
    });
    return acc;
  }, {});

  return grouped;
};

export default {
  createRencanaProduksi,
  getRencanaProduksiHarian,
  getDashboardSummary,
  getWeeklyTrend,
  searchOperator,
  getHistoryRPH,
};
