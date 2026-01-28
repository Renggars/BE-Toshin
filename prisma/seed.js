import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("🚀 Dimulai: Restart & Seeding Sistem Terpadu...");

  // ==========================================
  // 0. PEMBERSIHAN DATA TRANSAKSIONAL (URUTAN PENTING!)
  // ==========================================
  console.log("🧹 Membersihkan data transaksi lama...");
  await prisma.oEE.deleteMany({});
  await prisma.produksiLog.deleteMany({});
  await prisma.andonEvent.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.poinDisiplin.deleteMany({});
  await prisma.rencanaProduksi.deleteMany({});
  await prisma.target.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.divisi.deleteMany({});
  await prisma.mesin.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.masterMasalahAndon.deleteMany({});
  await prisma.tipeDisiplin.deleteMany({});

  // Hapus dari anak ke induk untuk menghindari FK Constraint Error
  const tables = [
    "oEE",
    "produksiLog",
    "andonEvent",
    "attendance",
    "poinDisiplin",
    "rencanaProduksi",
    "target",
    "shift",
    "masterMasalahAndon",
  ];

  for (const table of tables) {
    try {
      if (prisma[table]) {
        await prisma[table].deleteMany({});
      }
    } catch (error) {
      // Abaikan error jika tabel belum ada atau sudah kosong
      // console.log(`Skip pembersihan ${table}: ${error.message}`);
    }
  }

  // ==========================================
  // 1. DIVISI
  // ==========================================
  const masterDivisi = [
    { id: 1, nama_divisi: "Produksi" },
    { id: 2, nama_divisi: "Engineering" },
    { id: 3, nama_divisi: "Maintenance" },
    { id: 4, nama_divisi: "Quality" },
    { id: 5, nama_divisi: "Admin" },
  ];

  for (const div of masterDivisi) {
    await prisma.divisi.upsert({
      where: { id: div.id },
      update: { nama_divisi: div.nama_divisi },
      create: div,
    });
  }
  console.log("✅ Master divisi disinkronkan.");

  // ==========================================
  // 2. SHIFT (SESUAI GAMBAR CORETAN)
  // ==========================================
  const shiftData = [
    {
      id: 1,
      tipe_shift: "Normal",
      nama_shift: "Shift 1 (Normal)",
      jam_masuk: "07:30",
      jam_keluar: "15:30",
    },
    {
      id: 2,
      tipe_shift: "Normal",
      nama_shift: "Shift 2 (Normal)",
      jam_masuk: "15:30",
      jam_keluar: "23:30",
    },
    {
      id: 3,
      tipe_shift: "Normal",
      nama_shift: "Shift 3 (Normal)",
      jam_masuk: "23:30",
      jam_keluar: "07:30",
    },
    {
      id: 4,
      tipe_shift: "Long Shift",
      nama_shift: "Shift 1 (Long Shift)",
      jam_masuk: "07:30",
      jam_keluar: "19:30",
    },
    {
      id: 5,
      tipe_shift: "Long Shift",
      nama_shift: "Shift 2 (Long Shift)",
      jam_masuk: "19:30",
      jam_keluar: "07:30",
    },
  ];

  for (const shift of shiftData) {
    await prisma.shift.upsert({
      where: { id: shift.id },
      update: shift,
      create: shift,
    });
  }
  console.log("✅ Master shift disinkronkan.");

  // ==========================================
  // 3. STAFF & OPERATOR (USER)
  // ==========================================

  const staffData = [
    {
      id: 1,
      nama: "Budi Santoso",
      role: "SUPERVISOR",
      fk_id_divisi: 1,
      uid_nfc: "SUP-PROD-01",
      email: "supervisor@toshin.com",
      password: "$2a$12$R.S.Y.3.2.1.hash", // Dummy hash
      status: "active",
    },
    {
      id: 2,
      nama: "Hendra Wijaya",
      role: "ENGINEERING",
      fk_id_divisi: 2,
      uid_nfc: "ENG-01",
      email: "engineer@toshin.com",
      status: "active",
    },
  ];

  for (const user of staffData) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: user,
      create: { ...user, current_point: 100 },
    });
  }

  // Operator Dummy
  const operators = [
    { id: 10, nama: "Operator A", uid_nfc: "OP-01", plant: "2" },
    { id: 11, nama: "Operator B", uid_nfc: "OP-02", plant: "2" },
    { id: 12, nama: "Operator C", uid_nfc: "OP-03", plant: "2" },
  ];

  for (const op of operators) {
    await prisma.user.upsert({
      where: { id: op.id },
      update: op,
      create: {
        ...op,
        role: "OPERATOR",
        fk_id_divisi: 1,
        current_point: 100,
        status: "active",
      },
    });
  }
  console.log("✅ Data User (Staff & Operator) disinkronkan.");

  // ==========================================
  // 4. MASTER DATA (MESIN, PRODUK, PEKERJAAN)
  // ==========================================

  // Mesin dengan Ideal Cycle Time (detik/unit)
  const mesinData = [
    { id: 1, nama_mesin: "Cincom L20", ideal_cycle_time: 45.5 },
    { id: 2, nama_mesin: "Miyano BNA", ideal_cycle_time: 60.0 },
    { id: 3, nama_mesin: "Brother Speedio", ideal_cycle_time: 30.0 },
  ];

  for (const m of mesinData) {
    await prisma.mesin.upsert({
      where: { id: m.id },
      update: m,
      create: m,
    });
  }

  const produkData = [
    { id: 1, nama_produk: "Shaft Gear A" },
    { id: 2, nama_produk: "Nozzle B" },
    { id: 3, nama_produk: "Piston C" },
  ];

  for (const p of produkData) {
    await prisma.produk.upsert({
      where: { id: p.id },
      update: p,
      create: p,
    });
  }

  const pekerjaanData = [
    { id: 1, nama_pekerjaan: "Bubut" },
    { id: 2, nama_pekerjaan: "Milling" },
  ];

  for (const pj of pekerjaanData) {
    await prisma.jenisPekerjaan.upsert({
      where: { id: pj.id },
      update: pj,
      create: pj,
    });
  }
  console.log("✅ Master Mesin, Produk, Pekerjaan disinkronkan.");

  // ==========================================
  // 5. MASTER MASALAH ANDON
  // ==========================================
  // Data dari Gambar User
  const masalahAndon = [
    // --- PRODUCTION ---
    {
      nama_masalah: "Setup Dies",
      kategori: "Production",
      waktu_perbaikan: "00:15:00",
    },
    {
      nama_masalah: "Unsetup Dies",
      kategori: "Production",
      waktu_perbaikan: "00:15:00",
    },
    {
      nama_masalah: "Setup Coil",
      kategori: "Production",
      waktu_perbaikan: "00:05:00",
    },
    {
      nama_masalah: "Unsetup Coil",
      kategori: "Production",
      waktu_perbaikan: "00:10:00",
    },
    {
      nama_masalah: "Ganti Bak Scrap",
      kategori: "Production",
      waktu_perbaikan: "00:05:00",
    },
    {
      nama_masalah: "Setting Nozzle",
      kategori: "Production",
      waktu_perbaikan: "00:05:00",
    },
    {
      nama_masalah: "Die Safety",
      kategori: "Production",
      waktu_perbaikan: "00:05:00",
    },
    {
      nama_masalah: "Isi Cutting Oil",
      kategori: "Production",
      waktu_perbaikan: "00:03:00",
    },
    {
      nama_masalah: "Stp Unsetup Ds",
      kategori: "Production",
      waktu_perbaikan: "00:25:00",
    },
    {
      nama_masalah: "Stp Unsetup CL",
      kategori: "Production",
      waktu_perbaikan: "00:15:00",
    },
    {
      nama_masalah: "Trial Produk",
      kategori: "Production",
      waktu_perbaikan: "00:25:00",
    },

    // --- QUALITY CONTROL ---
    {
      nama_masalah: "Initial Check",
      kategori: "Quality Control",
      waktu_perbaikan: "00:02:00",
    },
    {
      nama_masalah: "Periodical Check",
      kategori: "Quality Control",
      waktu_perbaikan: "00:02:00",
    },
    {
      nama_masalah: "Abnormality",
      kategori: "Quality Control",
      waktu_perbaikan: "00:05:00",
    },

    // --- DIE MAINTENANCE ---
    {
      nama_masalah: "BD Dies Mesin",
      kategori: "Die Maintenance",
      waktu_perbaikan: "00:40:00",
    },
    {
      nama_masalah: "Abnormality",
      kategori: "Die Maintenance",
      waktu_perbaikan: "00:15:00",
    },
    {
      nama_masalah: "BD Dies Abnormal",
      kategori: "Die Maintenance",
      waktu_perbaikan: "00:45:00",
    },
  ];

  // Karena kode_masalah (unique) dihapus, kita tidak bisa pakai upsert dengan kode_masalah.
  // Tapi kita sudah clean up tabel di awal (deleteMany), jadi createMany aman.
  await prisma.masterMasalahAndon.createMany({
    data: masalahAndon,
  });
  console.log("✅ Master Masalah Andon disinkronkan.");

  // ==========================================
  // 6. TARGET PRODUKSI
  // ==========================================
  await prisma.target.create({
    data: {
      fk_produk: 1,
      fk_jenis_pekerjaan: 1,
      total_target: 500,
    },
  });

  // ==========================================
  // 7. SIMULASI ANDON & PRODUKSI HARI INI
  // ==========================================
  console.log("📊 Membuat simulasi dashboard Andon & OEE...");
  const today = new Date();

  // Ambil ID masalah untuk relasi (karena auto-increment)
  const masalahSetup = await prisma.masterMasalahAndon.findFirst({
    where: { nama_masalah: "Setup Dies" },
  });
  const masalahQC = await prisma.masterMasalahAndon.findFirst({
    where: { nama_masalah: "Initial Check" },
  });

  // A. Simulasi Andon Events (Downtime)
  // Mesin 1 mengalami Setup (Resolved)
  // Time travel: Triggered 08:00, Resolved 08:45
  const triggerTime = new Date(today);
  triggerTime.setHours(8, 0, 0, 0);
  const resolveTime = new Date(today);
  resolveTime.setHours(8, 45, 0, 0);

  if (masalahSetup) {
    await prisma.andonEvent.create({
      data: {
        fk_id_mesin: 1,
        fk_id_masalah: masalahSetup.id,
        fk_id_operator: 10,
        status: "RESOLVED",
        waktu_trigger: triggerTime,
        waktu_resolved: resolveTime,
        durasi_downtime: 45,
        resolved_by: 2,
        catatan: "Setup complete",
      },
    });
  }

  // Mesin 2 sedang QC (Active)
  const activeTime = new Date(today);
  activeTime.setHours(10, 30, 0, 0);

  if (masalahQC) {
    await prisma.andonEvent.create({
      data: {
        fk_id_mesin: 2, // Miyano
        fk_id_masalah: masalahQC.id,
        fk_id_operator: 11,
        status: "ACTIVE",
        waktu_trigger: activeTime,
      },
    });
  }

  // B. Simulasi Produksi Log (Untuk OEE)
  // Mesin 1: Shift 1 selesai
  const startProd = new Date(today);
  startProd.setHours(7, 30, 0, 0);
  const endProd = new Date(today);
  endProd.setHours(15, 30, 0, 0);

  await prisma.produksiLog.create({
    data: {
      fk_id_mesin: 1,
      fk_id_shift: 1,
      fk_id_operator: 10,
      total_target: 500,
      total_ok: 480,
      total_ng: 5,
      jam_mulai: startProd,
      jam_selesai: endProd,
      tanggal: today,
    },
  });

  // C. Simulasi OEE Data (Pre-calculated)
  // OEE Mesin 1
  await prisma.oEE.create({
    data: {
      fk_id_mesin: 1,
      fk_id_shift: null, // Daily
      availability: 85.5,
      performance: 92.0,
      quality: 99.0,
      oee_score: 77.86,
      loading_time: 460,
      downtime: 45,
      total_output: 485,
      total_ok: 480,
      tanggal: today,
    },
  });

  // ==========================================
  // 8. TIPE DISIPLIN (Basic)
  // ==========================================
  const tipeDisiplinData = [
    {
      kode: "TD01",
      nama_tipe_disiplin: "Terlambat < 15 menit",
      poin: 5,
      kategori: "Pelanggaran",
    },
    {
      kode: "TD02",
      nama_tipe_disiplin: "Tidak Pakai APD",
      poin: 20,
      kategori: "Pelanggaran",
    },
  ];

  for (const td of tipeDisiplinData) {
    await prisma.tipeDisiplin.upsert({
      where: { kode: td.kode },
      update: td,
      create: td,
    });
  }

  console.log("✅ Data simulasi Andon, Produksi, OEE berhasil dibuat.");
}

main()
  .catch((e) => {
    console.error("❌ Seeding Gagal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log("🏁 Proses Restart & Seeding Selesai.");
  });
