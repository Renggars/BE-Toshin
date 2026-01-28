// src/services/poin.service.js
import prisma from "../../prisma/index.js";
import { sendAlertEmail } from "../utils/email.js";

const BASE_POINT = 100;

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
  const { fk_id_operator, fk_tipe_disiplin } = payload;
  const hariIni = new Date();
  hariIni.setHours(0, 0, 0, 0);

  const [tipe, operator, rph] = await Promise.all([
    prisma.tipeDisiplin.findUnique({ where: { id: fk_tipe_disiplin } }),
    prisma.user.findUnique({
      where: { id: fk_id_operator },
      include: { divisi: true },
    }),
    prisma.rencanaProduksi.findFirst({
      where: { fk_id_user: fk_id_operator, tanggal: hariIni },
      select: { fk_id_shift: true },
    }),
  ]);

  if (!tipe || !operator) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Operator atau Tipe tidak ditemukan",
    );
  }

  const poinPotong = Math.abs(tipe.poin);
  const poinSetelahMelanggar = operator.current_point - poinPotong;

  let status_level = "Ringan";
  let alertType = "";

  if (poinSetelahMelanggar < 0) {
    status_level = "SP3";
    alertType = "SURAT PERINGATAN 3 (SP3)";
  } else if (poinSetelahMelanggar < 30) {
    status_level = "SP2";
    alertType = "SURAT PERINGATAN 2 (SP2)";
  } else if (poinSetelahMelanggar < 50) {
    status_level = "SP1";
    alertType = "SURAT PERINGATAN 1 (SP1)";
  } else if (poinSetelahMelanggar < 70) {
    status_level = "TEGURAN";
  }

  // 3. Simpan Transaksi & Update Saldo User secara Atomik (Transaction)
  const result = await prisma.$transaction(async (tx) => {
    // Kurangi poin di tabel User
    await tx.user.update({
      where: { id: fk_id_operator },
      data: { current_point: { decrement: poinPotong } },
    });

    // Catat riwayat pelanggaran
    return tx.poinDisiplin.create({
      data: {
        fk_id_operator,
        fk_id_staff: staffId,
        fk_tipe_disiplin,
        fk_id_shift: rph ? rph.fk_id_shift : null,
        poin_berubah: -poinPotong,
        status_level,
        tanggal: new Date(),
      },
      include: { tipe_disiplin: true },
    });
  });

  if (poinSetelahMelanggar < 50) {
    const plantEmails = {
      1: "puutradev06@gmail.com, puutradev02@gmail.com",
      2: "puutradev06@gmail.com, puutradev02@gmail.com",
      3: "puutradev06@gmail.com, puutradev02@gmail.com",
    };

    const recipient = plantEmails[operator.plant];

    if (recipient) {
      const subject = `NOTIFIKASI ${alertType}: ${operator.nama} (Plant ${operator.plant})`;
      const htmlContent = `
        <div style="font-family: sans-serif; border: 1px solid #ddd; padding: 20px;">
          <h2 style="color: #d32f2f;">Peringatan Disiplin Operator</h2>
          <p>Halo Supervisor,</p>
          <p>Sistem mendeteksi bahwa poin operator telah mencapai ambang batas <b>${alertType}</b>.</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 5px; border-bottom: 1px solid #eee;"><b>Nama:</b></td><td>${operator.nama}</td></tr>
            <tr><td style="padding: 5px; border-bottom: 1px solid #eee;"><b>Plant / Area:</b></td><td>Plant ${operator.plant} / ${operator.divisi.nama_divisi}</td></tr>
            <tr><td style="padding: 5px; border-bottom: 1px solid #eee;"><b>Pelanggaran:</b></td><td>${result.tipe_disiplin.nama_tipe_disiplin}</td></tr>
            <tr><td style="padding: 5px; border-bottom: 1px solid #eee;"><b>Sisa Poin:</b></td><td style="color: red; font-weight: bold;">${poinSetelahMelanggar}</td></tr>
          </table>
          <p>Mohon segera tindak lanjuti sesuai prosedur yang berlaku.</p>
        </div>
      `;

      // Kirim email tanpa await agar tidak memperlambat respon API utama
      sendAlertEmail(recipient, subject, htmlContent);
    }
  }

  return result;
};

const getPoinDashboardStats = async (plant) => {
  const whereOperator = {
    role: "OPERATOR",
    ...(plant && { plant: String(plant) }),
  };

  // 1. Ambil Summary - PASTIKAN 'id' juga di-select
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

  // 2. Ambil List ID (Sekarang sudah aman, tidak akan undefined)
  const targetUserIds = users.map((u) => u.id);

  // 3. GroupBy Shift
  const shiftStatsRaw = await prisma.poinDisiplin.groupBy({
    by: ["fk_id_shift"],
    _count: { id: true },
    where: {
      fk_id_operator: { in: targetUserIds },
    },
  });

  const masterShift = await prisma.shift.findMany();
  const shift_stats = shiftStatsRaw.map((stat) => ({
    label:
      masterShift.find((s) => s.id === stat.fk_id_shift)?.nama_shift ||
      "Tanpa Shift",
    value: stat._count.id,
  }));

  // 4. Top Violations
  const topViolationsRaw = await prisma.poinDisiplin.groupBy({
    by: ["fk_tipe_disiplin"],
    _count: { id: true },
    where: { fk_id_operator: { in: targetUserIds } },
    orderBy: { _count: { id: "desc" } },
    take: 4,
  });

  const masterTipe = await prisma.tipeDisiplin.findMany({
    where: { id: { in: topViolationsRaw.map((v) => v.fk_tipe_disiplin) } },
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
    role: "OPERATOR",
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

export default {
  getUserCurrentPoin,
  createPelanggaran,
  getPoinDashboardStats,
  getPoinRankings,
};
