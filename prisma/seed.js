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
  console.log("--- Starting Seed ---");
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
        update: { namaDivisi: row[1].toString().trim() },
        create: { id: parseInt(row[0]), namaDivisi: row[1].toString().trim() },
      });
    }
  }

  // 2. Seed Users
  // Kolom di data_operator.xlsx (header baris 0):
  // [0]=nama, [1]=password, [2]=jenis operator/divisi, [3]=Plant, [4]=Line, [5]=Foto, [6]=fk_id_divisi, [7]=NO. REG
  console.log("Seeding Users...");
  const rawOperatorData = xlsx.utils.sheet_to_json(
    operatorWB.Sheets["Operator"],
    { header: 1 },
  );

  const salt = await bcrypt.genSalt(10);
  const hashedPassword123 = await bcrypt.hash("123", salt);

  const validRoles = [
    "PRODUKSI", "QUALITY", "MAINTENANCE", "DIE_MAINT", "ENGINEERING",
    "MARKETING", "COMMERCIAL", "PPIC", "HCPGA", "WRH_CIBITUNG",
    "GA", "WAREHOUSE", "PURCHASING", "HC", "ACCOUNTING", "FINANCE",
    "ADMIN", "SUPERVISOR",
  ];

  let noRegCounter = 90000; // counter fallback jika noReg kosong
  let uidNfcCounter = 1;

  for (let i = 1; i < rawOperatorData.length; i++) {
    const row = rawOperatorData[i];

    // col[0] = nama
    const nama = row[0]?.toString().trim();
    if (!nama || nama.toLowerCase() === "nama") continue;

    // col[2] = jenis operator / divisi -> role
    const rawRole = row[2]?.toString().trim().toUpperCase().replace(/\s+/g, "_") || "PRODUKSI";
    const role = validRoles.includes(rawRole) ? rawRole : "PRODUKSI";

    // col[3] = Plant, col[4] = Line
    const plant = row[3]?.toString().trim() || "3";
    const line = row[4]?.toString().trim() || "-";

    // col[5] = Foto
    const fotoProfile = row[5]?.toString().trim() || null;

    // col[6] = fk_id_divisi
    const divisiId = parseInt(row[6]) || 1;

    // col[7] = NO. REG, fallback ke counter
    let noReg = row[7]?.toString().trim();
    if (!noReg || noReg === "") {
      noReg = `ID${noRegCounter++}`;
    }

    // uid_nfc auto-increment dari 1
    let uidNfc = (uidNfcCounter++).toString();

    try {
      await prisma.user.upsert({
        where: { noReg },
        update: {
          nama,
          password: hashedPassword123,
          role,
          plant,
          line,
          fotoProfile: fotoProfile || null,
          divisiId,
          uidNfc,
        },
        create: {
          noReg,
          nama,
          password: hashedPassword123,
          uidNfc,
          role,
          plant,
          line,
          fotoProfile: fotoProfile || null,
          divisiId,
        },
      });
    } catch (err) {
      console.error(`[Seed Error] Gagal upsert user "${nama}" (noReg: ${noReg}): ${err.message}`);
    }
  }

  // 4. Seed Mesin
  console.log("Seeding Mesin...");
  const mesinWB = xlsx.readFile(path.join(csvDir, "data_mesin.xlsx"));
  const rawMesinData = xlsx.utils.sheet_to_json(mesinWB.Sheets["data_mesin"], {
    header: 1,
  });

  const validKategoriMesin = [
    "PRIMARY",
    "SECONDARY",
    "NON_PRESS",
  ];

  for (let i = 1; i < rawMesinData.length; i++) {
    const row = rawMesinData[i];
    if (row[0]) {
      const namaMesin = row[0].toString().trim();
      const line = row[1]?.toString().trim() || "";
      const rawKategori =
        row[2]?.toString().trim().toUpperCase().replace(/\s+/g, "_") || "PRIMARY";

      let kategori = validKategoriMesin.includes(rawKategori)
        ? rawKategori
        : "PRIMARY";

      await prisma.mesin.upsert({
        where: { namaMesin },
        update: { kategori, line },
        create: { namaMesin, kategori, line },
      });
    }
  }

  // 5. Seed TipeDisiplin
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
          namaTipeDisiplin: row[1].toString().trim(),
          poin: parseInt(row[2]),
          kategori:
            row[3].toString().toUpperCase() === "PENGHARGAAN"
               ? "PENGHARGAAN"
              : "PELANGGARAN",
        },
        create: {
          kode: row[0].toString().trim(),
          namaTipeDisiplin: row[1].toString().trim(),
          poin: parseInt(row[2]),
          kategori:
            row[3].toString().toUpperCase() === "PENGHARGAAN"
              ? "PENGHARGAAN"
              : "PELANGGARAN",
        },
      });
    }
  }

  // 6. Seed Produk, JenisPekerjaan, Target
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
        update: { namaProduk: rawProduk[i][1].toString().trim() },
        create: {
          id: parseInt(rawProduk[i][0]),
          namaProduk: rawProduk[i][1].toString().trim(),
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
        update: { namaPekerjaan: rawJenis[i][1].toString().trim() },
        create: {
          id: parseInt(rawJenis[i][0]),
          namaPekerjaan: rawJenis[i][1].toString().trim(),
        },
      });
    }
  }

  const rawTarget = xlsx.utils.sheet_to_json(targetWB.Sheets["target"], {
    header: 1,
  });
  for (let i = 1; i < rawTarget.length; i++) {
    const row = rawTarget[i];
    if (row[3] && row[4]) {
      const produkId = parseInt(row[3]);
      const jenisPekerjaanId = parseInt(row[4]);
      
      const existing = await prisma.target.findFirst({
        where: { produkId, jenisPekerjaanId }
      });

      if (!existing) {
        await prisma.target.create({
          data: {
            produkId,
            jenisPekerjaanId,
            totalTarget: parseInt(row[2]) || 0,
            idealCycleTime: parseFloat(row[5]) || 0,
          },
        });
      } else {
        await prisma.target.update({
          where: { id: existing.id },
          data: {
            totalTarget: parseInt(row[2]) || 0,
            idealCycleTime: parseFloat(row[5]) || 0,
          }
        });
      }
    }
  }

  // 7. Seed Shift
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
          tipeShift: row[1].toString(),
          namaShift: row[2].toString(),
          jamMasuk: excelTimeToStr(row[3]),
          jamKeluar: excelTimeToStr(row[4]),
          breakDuration: parseInt(row[5]) || 60,
          cleaningDuration: parseInt(row[6]) || 10,
          briefingDuration: parseInt(row[7]) || 10,
          toiletTolerancePct: parseFloat(row[8]) || 0.1,
        },
        create: {
          id: parseInt(row[0]),
          tipeShift: row[1].toString(),
          namaShift: row[2].toString(),
          jamMasuk: excelTimeToStr(row[3]),
          jamKeluar: excelTimeToStr(row[4]),
          breakDuration: parseInt(row[5]) || 60,
          cleaningDuration: parseInt(row[6]) || 10,
          briefingDuration: parseInt(row[7]) || 10,
          toiletTolerancePct: parseFloat(row[8]) || 0.1,
        },
      });
    }
  }

  // 8. Seed MasterMasalahAndon
  console.log("Seeding MasterMasalahAndon...");
  const andonFilePath = path.join(csvDir, "data_master_masalah_andon.xlsx");
  const andonWorkbook = xlsx.readFile(andonFilePath);
  const andonCategoriesMapping = {
    MAINTENANCE: "MAINTENANCE",
    QUALITY_CONTROL: "QUALITY",
    DIE_MAINTENANCE: "DIE_MAINT",
    PRODUCTION: "PRODUKSI",
    PLAN_DOWNTIME: "PLAN_DOWNTIME",
  };

  console.log("Clearing existing MasterMasalahAndon records...");
  await prisma.masterMasalahAndon.deleteMany();

  for (const [sheetName, kategoriEnum] of Object.entries(
    andonCategoriesMapping,
  )) {
    const sheet = andonWorkbook.Sheets[sheetName];
    if (!sheet) {
      console.warn(`Sheet "${sheetName}" not found in Excel file, skipping...`);
      continue;
    }

    const data = xlsx.utils.sheet_to_json(sheet);
    console.log(`Seeding ${data.length} records for category: ${sheetName} (Enum: ${kategoriEnum})`);

    const records = data
      .map((row) => {
        const nama_masalah = row["Keterangan"];
        const timeout = row["Timeout (HH:MM:SS)"];

        if (!nama_masalah) return null;

        return {
          namaMasalah: nama_masalah.toString().trim(),
          kategori: kategoriEnum,
          waktuPerbaikanMenit: timeToMinutes(timeout),
        };
      })
      .filter((record) => record !== null);

    if (records.length > 0) {
      await prisma.masterMasalahAndon.createMany({
        data: records,
      });
    }
  }

  console.log("--- Seed Completed Successfully ---");
}

/**
 * Converts Excel time (fraction of a day or HH:MM:SS string) to total minutes as an integer.
 */
function timeToMinutes(timeValue) {
  if (timeValue === undefined || timeValue === null) return 0;
  if (typeof timeValue === "number") {
    return Math.round(timeValue * 24 * 60);
  }
  if (typeof timeValue === "string") {
    const parts = timeValue.split(":");
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      return hours * 60 + minutes;
    }
  }
  return 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
