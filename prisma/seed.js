import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Mulai seeding sistem terpadu...");

  // 1. Inisialisasi Master Divisi
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

  // 1.5 Master Shift
  const shiftData = [
    {
      tipe_shift: "Normal",
      nama_shift: "Normal (Day)",
      jam_masuk: "07:30:00",
      jam_keluar: "16:30:00",
    },
    {
      tipe_shift: "Long Shift",
      nama_shift: "Long Shift Pagi",
      jam_masuk: "07:30:00",
      jam_keluar: "19:30:00",
    },
    {
      tipe_shift: "Long Shift",
      nama_shift: "Long Shift Malam",
      jam_masuk: "19:30:00",
      jam_keluar: "07:30:00",
    },
    {
      tipe_shift: "Group",
      nama_shift: "Group A (Pagi)",
      jam_masuk: "07:30:00",
      jam_keluar: "15:30:00",
    },
    {
      tipe_shift: "Group",
      nama_shift: "Group B (Siang)",
      jam_masuk: "15:30:00",
      jam_keluar: "23:30:00",
    },
    {
      tipe_shift: "Group",
      nama_shift: "Group C (Malam)",
      jam_masuk: "23:30:00",
      jam_keluar: "07:30:00",
    },
  ];

  for (const shift of shiftData) {
    await prisma.shift.upsert({
      where: {
        // kombinasi unik secara logis
        nama_shift: shift.nama_shift,
      },
      update: {
        tipe_shift: shift.tipe_shift,
        jam_masuk: shift.jam_masuk,
        jam_keluar: shift.jam_keluar,
      },
      create: shift,
    });
  }

  console.log("✅ Master shift berhasil diseed.");

  // 2. Seed User Non-Operator (Supervisor, Engineering, Maintenance)
  // UID NFC diisi manual sebagai placeholder (bisa diganti UID kartu asli)
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
      update: {
        nama: user.nama,
        role: user.role,
        fk_id_divisi: user.fk_id_divisi,
      },
      create: user,
    });
  }

  // 3. Master Data Dasar (Mesin, Produk, Pekerjaan)
  const masterImports = [
    {
      file: "data_mesin.csv",
      model: prisma.mesin,
      uniqueKey: "nama_mesin",
      mapping: (row) => ({ nama_mesin: row[0] }),
    },
    {
      file: "data_produk.csv",
      model: prisma.produk,
      uniqueKey: "nama_produk",
      mapping: (row) => ({ nama_produk: row[0] }),
    },
    {
      file: "data_pekerjaan.csv",
      model: prisma.jenisPekerjaan,
      uniqueKey: "nama_pekerjaan",
      mapping: (row) => ({ nama_pekerjaan: row[0] }),
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
        const data = config.mapping(row);
        await config.model.upsert({
          where: { [config.uniqueKey]: data[config.uniqueKey] },
          update: data,
          create: data,
        });
      }
      console.log(`✅ ${config.file} berhasil diimport.`);
    }
  }

  // 4. Import Tipe Disiplin
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
          poin: parseInt(row[2]) || 0,
          kategori: "Pelanggaran",
        },
        create: {
          kode: row[0],
          nama_tipe_disiplin: row[1],
          poin: parseInt(row[2]) || 0,
          kategori: "Pelanggaran",
        },
      });
    }
    console.log(`✅ data_poin_pelanggaran.csv berhasil diimport.`);
  }

  // 5. Import Target (Logika Pembersihan Angka)
  const targetPath = path.join(__dirname, "csv", "data_target.csv");
  if (fs.existsSync(targetPath)) {
    const allProduk = await prisma.produk.findMany();
    const allPekerjaan = await prisma.jenisPekerjaan.findMany();
    const produkMap = new Map(
      allProduk.map((p) => [p.nama_produk.trim().toUpperCase(), p.id]),
    );
    const pekerjaanMap = new Map(
      allPekerjaan.map((pj) => [pj.nama_pekerjaan.trim().toUpperCase(), pj.id]),
    );

    await prisma.target.deleteMany({}); // Bersihkan target lama
    const records = parse(fs.readFileSync(targetPath), {
      from_line: 2,
      trim: true,
      skip_empty_lines: true,
    });

    for (const row of records) {
      const pId = produkMap.get(row[0]?.trim().toUpperCase());
      const pjId = pekerjaanMap.get(row[1]?.trim().toUpperCase());
      if (pId && pjId) {
        const match = row[2]?.match(/\d+/);
        await prisma.target.create({
          data: {
            fk_produk: pId,
            fk_jenis_pekerjaan: pjId,
            total_target: match ? parseInt(match[0]) : 0,
          },
        });
      }
    }
    console.log("✅ Data target berhasil disinkronisasi.");
  }

  // 6. Import Operator dari CSV (Sekarang masuk ke model User)
  const operatorPath = path.join(__dirname, "csv", "data_operator.csv");
  if (fs.existsSync(operatorPath)) {
    const records = parse(fs.readFileSync(operatorPath), {
      from_line: 2,
      trim: true,
    });
    for (const row of records) {
      if (!row[1]) continue;
      const linkFoto = row[2] || null;

      await prisma.user.upsert({
        where: { uid_nfc: row[1] },
        update: {
          nama: row[0],
          role: "OPERATOR",
          foto_profile: linkFoto,
          fk_id_divisi: 1, // Masuk ke Produksi
        },
        create: {
          nama: row[0],
          uid_nfc: row[1],
          role: "OPERATOR",
          foto_profile: linkFoto,
          fk_id_divisi: 1,
          status: "active",
          point_cycle_start: new Date(new Date().setDate(1)),
        },
      });
    }
    console.log(`✅ data_operator.csv berhasil diimport ke tabel User.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log("🏁 Seeding selesai.");
  });
