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
  // Hapus dari anak ke induk untuk menghindari FK Constraint Error
  const tables = [
    "attendance",
    "poinDisiplin",
    "rencanaProduksi",
    "target",
    "shift",
  ];

  for (const table of tables) {
    try {
      await prisma[table].deleteMany({});
    } catch (error) {
      // Abaikan error jika tabel belum ada atau sudah kosong
      console.log(`⚠️  Skip pembersihan ${table}: Mungkin sudah kosong.`);
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
      tipe_shift: "Normal",
      nama_shift: "Shift 1 (Normal)",
      jam_masuk: "07:30",
      jam_keluar: "15:30",
    },
    {
      tipe_shift: "Normal",
      nama_shift: "Shift 2 (Normal)",
      jam_masuk: "15:30",
      jam_keluar: "23:30",
    },
    {
      tipe_shift: "Normal",
      nama_shift: "Shift 3 (Normal)",
      jam_masuk: "23:30",
      jam_keluar: "07:30",
    },
    {
      tipe_shift: "Long Shift",
      nama_shift: "Shift 1 (Long Shift)",
      jam_masuk: "07:30",
      jam_keluar: "19:30",
    },
    {
      tipe_shift: "Long Shift",
      nama_shift: "Shift 2 (Long Shift)",
      jam_masuk: "19:30",
      jam_keluar: "07:30",
    },
    {
      tipe_shift: "Group",
      nama_shift: "Shift 1 (Group C)",
      jam_masuk: "15:00",
      jam_keluar: "00:00",
    },
    {
      tipe_shift: "Group",
      nama_shift: "Shift 2 (Group C)",
      jam_masuk: "23:00",
      jam_keluar: "08:00",
    },
    {
      tipe_shift: "Group",
      nama_shift: "Shift 3 (Group C)",
      jam_masuk: "07:30",
      jam_keluar: "16:30",
    },
  ];

  for (const shift of shiftData) {
    await prisma.shift.upsert({
      where: { nama_shift: shift.nama_shift },
      update: shift,
      create: shift,
    });
  }
  console.log("✅ Master shift disinkronkan.");

  // ==========================================
  // 3. STAFF & OPERATOR (USER)
  // ==========================================
  // Pembersihan User: Kita tidak deleteMany karena User adalah tabel utama,
  // kita gunakan upsert agar data yang ada diperbarui.

  const staffData = [
    {
      nama: "Budi Santoso",
      role: "SUPERVISOR",
      fk_id_divisi: 1,
      uid_nfc: "SUP-PROD-01",
    },
    {
      nama: "Siti Aminah",
      role: "SUPERVISOR",
      fk_id_divisi: 1,
      uid_nfc: "SUP-PROD-02",
    },
    {
      nama: "Hendra Wijaya",
      role: "ENGINEERING",
      fk_id_divisi: 2,
      uid_nfc: "ENG-01",
    },
    {
      nama: "Rahmat Hidayat",
      role: "MAINTENANCE",
      fk_id_divisi: 3,
      uid_nfc: "MNT-01",
    },
  ];

  for (const user of staffData) {
    await prisma.user.upsert({
      where: { uid_nfc: user.uid_nfc },
      update: { ...user, current_point: 100 },
      create: { ...user, current_point: 100 },
    });
  }

  // ==========================================
  // 4. MASTER DATA (MESIN, PRODUK, PEKERJAAN)
  // ==========================================
  const masterImports = [
    { file: "data_mesin.csv", model: prisma.mesin, key: "nama_mesin" },
    { file: "data_produk.csv", model: prisma.produk, key: "nama_produk" },
    {
      file: "data_pekerjaan.csv",
      model: prisma.jenisPekerjaan,
      key: "nama_pekerjaan",
    },
  ];

  for (const config of masterImports) {
    const filePath = path.join(__dirname, "csv", config.file);
    if (fs.existsSync(filePath)) {
      const records = parse(fs.readFileSync(filePath), {
        from_line: 2,
        trim: true,
      });
      for (const row of records) {
        if (!row[0]) continue;
        await config.model.upsert({
          where: { [config.key]: row[0] },
          update: { [config.key]: row[0] },
          create: { [config.key]: row[0] },
        });
      }
      console.log(`✅ CSV ${config.file} diimport.`);
    }
  }

  // ==========================================
  // 5. TIPE DISIPLIN
  // ==========================================
  const poinPath = path.join(__dirname, "csv", "data_poin_pelanggaran.csv");
  if (fs.existsSync(poinPath)) {
    const records = parse(fs.readFileSync(poinPath), {
      from_line: 2,
      trim: true,
    });
    for (const row of records) {
      if (!row[0]) continue;
      await prisma.tipeDisiplin.upsert({
        where: { kode: row[0] },
        update: {
          nama_tipe_disiplin: row[1],
          poin: Math.abs(parseInt(row[2])) || 0,
          kategori: "Pelanggaran",
        },
        create: {
          kode: row[0],
          nama_tipe_disiplin: row[1],
          poin: Math.abs(parseInt(row[2])) || 0,
          kategori: "Pelanggaran",
        },
      });
    }
    console.log(`✅ Master Tipe Disiplin disinkronkan.`);
  }

  // ==========================================
  // 6. TARGET PRODUKSI (RE-INSERT)
  // ==========================================
  const targetPath = path.join(__dirname, "csv", "data_target.csv");
  if (fs.existsSync(targetPath)) {
    const [allP, allPJ] = await Promise.all([
      prisma.produk.findMany(),
      prisma.jenisPekerjaan.findMany(),
    ]);
    const produkMap = new Map(
      allP.map((p) => [p.nama_produk.toUpperCase(), p.id]),
    );
    const pekerjaanMap = new Map(
      allPJ.map((pj) => [pj.nama_pekerjaan.toUpperCase(), pj.id]),
    );

    const records = parse(fs.readFileSync(targetPath), {
      from_line: 2,
      trim: true,
      skip_empty_lines: true,
    });

    for (const row of records) {
      const pId = produkMap.get(row[0]?.trim().toUpperCase());
      const pjId = pekerjaanMap.get(row[1]?.trim().toUpperCase());
      if (pId && pjId) {
        const val = row[2]?.match(/\d+/);
        await prisma.target.create({
          data: {
            fk_produk: pId,
            fk_jenis_pekerjaan: pjId,
            total_target: val ? parseInt(val[0]) : 0,
          },
        });
      }
    }
    console.log("✅ Data Target Produksi disinkronkan.");
  }

  // ==========================================
  // 7. OPERATOR
  // ==========================================
  const operatorPath = path.join(__dirname, "csv", "data_operator.csv");
  if (fs.existsSync(operatorPath)) {
    const records = parse(fs.readFileSync(operatorPath), {
      from_line: 2,
      trim: true,
    });
    for (const row of records) {
      if (!row[1]) continue;
      await prisma.user.upsert({
        where: { uid_nfc: row[1] },
        update: {
          nama: row[0],
          role: "OPERATOR",
          plant: row[4] || "2",
          foto_profile: row[2] || null,
          fk_id_divisi: 1,
          current_point: 100,
        },
        create: {
          nama: row[0],
          uid_nfc: row[1],
          role: "OPERATOR",
          plant: row[4] || "2",
          foto_profile: row[2] || null,
          fk_id_divisi: 1,
          status: "active",
          current_point: 100,
          point_cycle_start: new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ),
        },
      });
    }
    console.log(`✅ Data Operator disinkronkan.`);
  }
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
