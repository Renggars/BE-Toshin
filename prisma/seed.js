import { PrismaClient } from "@prisma/client";
import xlsx from "xlsx";
import bcrypt from "bcryptjs";
import path from "path";

const prisma = new PrismaClient();

// Helper to convert Excel time (fraction of day) to HH:mm string
function excelTimeToStr(excelTime) {
  if (typeof excelTime !== "number") return excelTime?.toString() || "00:00";
  const totalMinutes = Math.round(excelTime * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
}

async function main() {
  console.log("--- Starting Comprehensive Seed ---");
  const csvDir = path.resolve("prisma/csv");

  // 1. Seed Divisi
  console.log("Seeding Divisi...");
  const operatorWB = xlsx.readFile(path.join(csvDir, "data_operator.xlsx"));
  const rawDivisiData = xlsx.utils.sheet_to_json(
    operatorWB.Sheets["Master Divisi"],
    { header: 1 },
  );
  for (let i = 1; i < rawDivisiData.length; i++) {
    const row = rawDivisiData[i];
    if (row[0] && row[1]) {
      await prisma.divisi.upsert({
        where: { id: parseInt(row[0]) },
        update: { nama_divisi: row[1].toString().trim() },
        create: { id: parseInt(row[0]), nama_divisi: row[1].toString().trim() },
      });
    }
  }

  // 2. Seed Users
  console.log("Seeding Users...");
  const rawOperatorData = xlsx.utils.sheet_to_json(
    operatorWB.Sheets["Operator"],
    { header: 1 },
  );
  const salt = await bcrypt.genSalt(10);
  const validRoles = [
    "PRODUKSI",
    "QUALITY",
    "MAINTENANCE",
    "DIE_MAINT",
    "ENGINEERING",
    "MARKETING",
    "COMMERCIAL",
    "PPIC",
    "HCPGA",
    "WRH_CIBITUNG",
    "GA",
    "WAREHOUSE",
    "PURCHASING",
    "HC",
    "ACCOUNTING",
    "FINANCE",
    "ADMIN",
  ];

  for (let i = 1; i < rawOperatorData.length; i++) {
    const row = rawOperatorData[i];
    if (!row[1]) continue;

    const rawRole =
      row[5]?.toString().trim().toUpperCase().replace(/\s+/g, "_") ||
      "PRODUKSI";
    let role = validRoles.includes(rawRole)
      ? rawRole
      : rawRole === "DIE_MAINT"
      ? "DIE_MAINT"
      : rawRole === "WRH_CIBITUNG"
      ? "WRH_CIBITUNG"
      : "PRODUKSI";

    const password = row[3]?.toString() || "password123";
    const hashedPassword = await bcrypt.hash(password, salt);

    await prisma.user.upsert({
      where: {
        uid_nfc: row[4]?.toString() || undefined,
        email: row[2]?.toString() || undefined,
      },
      update: {
        nama: row[1].toString(),
        password: hashedPassword,
        role: role,
        plant: row[6]?.toString() || "3",
        line: row[7]?.toString() || "-",
        foto_profile: row[8]?.toString() || null,
        fk_id_divisi: parseInt(row[9]) || 1,
      },
      create: {
        nama: row[1].toString(),
        email: row[2]?.toString() || null,
        password: hashedPassword,
        uid_nfc: row[4]?.toString() || null,
        role: role,
        plant: row[6]?.toString() || "3",
        line: row[7]?.toString() || "-",
        foto_profile: row[8]?.toString() || null,
        fk_id_divisi: parseInt(row[9]) || 1,
      },
    });
  }

  // 3. Seed Mesin
  console.log("Seeding Mesin...");
  const mesinWB = xlsx.readFile(path.join(csvDir, "data_mesin.xlsx"));
  const rawMesinData = xlsx.utils.sheet_to_json(mesinWB.Sheets["data_mesin"], {
    header: 1,
  });

  const validKategoriMesin = [
    "PROGRESIVE_TRANSFER",
    "FINE_BLANKING",
    "SECONDARY",
    "PRESS",
    "TACI",
  ];

  for (let i = 1; i < rawMesinData.length; i++) {
    const row = rawMesinData[i];
    if (row[1]) {
      const nama_mesin = row[1].toString().trim();
      const rawKategori =
        row[2]?.toString().trim().toUpperCase().replace(/\s+/g, "_") || "PRESS";

      let kategori = validKategoriMesin.includes(rawKategori)
        ? rawKategori
        : "PRESS";

      await prisma.mesin.upsert({
        where: { nama_mesin },
        update: { kategori },
        create: { nama_mesin, kategori },
      });
    }
  }

  // 4. Seed TipeDisiplin
  console.log("Seeding TipeDisiplin...");
  const disiplinWB = xlsx.readFile(
    path.join(csvDir, "data_poin_pelanggaran.xlsx"),
  );
  const rawDisiplinData = xlsx.utils.sheet_to_json(
    disiplinWB.Sheets["data_poin_pelanggaran"],
    { header: 1 },
  );
  for (let i = 1; i < rawDisiplinData.length; i++) {
    const row = rawDisiplinData[i];
    if (row[0] && row[1]) {
      await prisma.tipeDisiplin.upsert({
        where: { kode: row[0].toString().trim() },
        update: {
          nama_tipe_disiplin: row[1].toString().trim(),
          poin: parseInt(row[2]),
          kategori:
            row[3].toString().toUpperCase() === "PENGHARGAAN"
              ? "PENGHARGAAN"
              : "PELANGGARAN",
        },
        create: {
          kode: row[0].toString().trim(),
          nama_tipe_disiplin: row[1].toString().trim(),
          poin: parseInt(row[2]),
          kategori:
            row[3].toString().toUpperCase() === "PENGHARGAAN"
              ? "PENGHARGAAN"
              : "PELANGGARAN",
        },
      });
    }
  }

  // 5. Seed Produk, JenisPekerjaan, Target
  console.log("Seeding Produk, JenisPekerjaan, Target...");
  const targetWB = xlsx.readFile(
    path.join(csvDir, "data_produk_jenisPekerjaan_target.xlsx"),
  );

  const rawProduk = xlsx.utils.sheet_to_json(targetWB.Sheets["produk"], {
    header: 1,
  });
  for (let i = 1; i < rawProduk.length; i++) {
    if (rawProduk[i][0]) {
      await prisma.produk.upsert({
        where: { id: parseInt(rawProduk[i][0]) },
        update: { nama_produk: rawProduk[i][1].toString().trim() },
        create: {
          id: parseInt(rawProduk[i][0]),
          nama_produk: rawProduk[i][1].toString().trim(),
        },
      });
    }
  }

  const rawJenis = xlsx.utils.sheet_to_json(
    targetWB.Sheets["jenis_pekerjaan"],
    { header: 1 },
  );
  for (let i = 1; i < rawJenis.length; i++) {
    if (rawJenis[i][0]) {
      await prisma.jenisPekerjaan.upsert({
        where: { id: parseInt(rawJenis[i][0]) },
        update: { nama_pekerjaan: rawJenis[i][1].toString().trim() },
        create: {
          id: parseInt(rawJenis[i][0]),
          nama_pekerjaan: rawJenis[i][1].toString().trim(),
        },
      });
    }
  }

  const rawTarget = xlsx.utils.sheet_to_json(targetWB.Sheets["target"], {
    header: 1,
  });
  for (let i = 1; i < rawTarget.length; i++) {
    const row = rawTarget[i];
    // Headers: ["PRODUK","JENIS_PEKERJAAN","TARGET","fk_produk","fk_jenis_pekerjaan","CYCLE TIME (menit / pcs)","PEMBULATAN CYCLE TIME (menit / pcs) "]
    if (row[3] && row[4]) {
      await prisma.target.create({
        data: {
          fk_produk: parseInt(row[3]),
          fk_jenis_pekerjaan: parseInt(row[4]),
          total_target: parseInt(row[2]) || 0,
          ideal_cycle_time: parseFloat(row[5]) || 0,
        },
      });
    }
  }

  // 6. Seed Shift
  console.log("Seeding Shift...");
  const shiftWB = xlsx.readFile(path.join(csvDir, "data_shift.xlsx"));
  const rawShiftData = xlsx.utils.sheet_to_json(
    shiftWB.Sheets["data_target - Copy"],
    { header: 1 },
  );
  for (let i = 1; i < rawShiftData.length; i++) {
    const row = rawShiftData[i];
    if (row[0]) {
      await prisma.shift.upsert({
        where: { id: parseInt(row[0]) },
        update: {
          tipe_shift: row[1].toString(),
          nama_shift: row[2].toString(),
          jam_masuk: excelTimeToStr(row[3]),
          jam_keluar: excelTimeToStr(row[4]),
          break_duration: parseInt(row[5]) || 60,
          cleaning_duration: parseInt(row[6]) || 10,
          briefing_duration: parseInt(row[7]) || 10,
          toilet_tolerance_pct: parseFloat(row[8]) || 0.1,
        },
        create: {
          id: parseInt(row[0]),
          tipe_shift: row[1].toString(),
          nama_shift: row[2].toString(),
          jam_masuk: excelTimeToStr(row[3]),
          jam_keluar: excelTimeToStr(row[4]),
          break_duration: parseInt(row[5]) || 60,
          cleaning_duration: parseInt(row[6]) || 10,
          briefing_duration: parseInt(row[7]) || 10,
          toilet_tolerance_pct: parseFloat(row[8]) || 0.1,
        },
      });
    }
  }

  console.log("--- Seed Completed Successfully ---");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
