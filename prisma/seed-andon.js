import { PrismaClient } from "@prisma/client";
import xlsx from "xlsx";
import path from "path";

const prisma = new PrismaClient();

/**
 * Converts Excel time (fraction of a day or HH:MM:SS string) to total minutes as an integer.
 * @param {any} timeValue
 * @returns {number}
 */
function timeToMinutes(timeValue) {
  if (timeValue === undefined || timeValue === null) return 0;

  if (typeof timeValue === "number") {
    // xlsx parses HH:MM:SS as a fraction of a day (e.g. 0.5 for 12:00:00)
    return Math.round(timeValue * 24 * 60);
  }

  if (typeof timeValue === "string") {
    // Handle "HH:MM:SS" or "HH:MM"
    const parts = timeValue.split(":");
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      return hours * 60 + minutes;
    }
  }

  return 0;
}

async function main() {
  console.log("--- Starting MasterMasalahAndon Seed ---");

  const filePath = path.resolve("prisma/csv/data_master_masalah_andon.xlsx");
  const workbook = xlsx.readFile(filePath);

  const categories = [
    "MAINTENANCE",
    "QUALITY_CONTROL",
    "DIE_MAINTENANCE",
    "PRODUCTION",
  ];

  // Clear existing data to avoid duplicates on re-run
  console.log("Clearing existing MasterMasalahAndon records...");
  await prisma.masterMasalahAndon.deleteMany();

  for (const category of categories) {
    const sheet = workbook.Sheets[category];
    if (!sheet) {
      console.warn(`Sheet "${category}" not found in Excel file, skipping...`);
      continue;
    }

    // Convert sheet to JSON
    // Mapping: No (ignored), Keterangan -> nama_masalah, Timeout (HH:MM:SS) -> waktu_perbaikan_menit
    const data = xlsx.utils.sheet_to_json(sheet);
    console.log(`Seeding ${data.length} records for category: ${category}`);

    const records = data
      .map((row) => {
        const nama_masalah = row["Keterangan"];
        const timeout = row["Timeout (HH:MM:SS)"];

        if (!nama_masalah) return null;

        return {
          nama_masalah: nama_masalah.toString().trim(),
          kategori: category,
          waktu_perbaikan_menit: timeToMinutes(timeout),
        };
      })
      .filter((record) => record !== null);

    if (records.length > 0) {
      await prisma.masterMasalahAndon.createMany({
        data: records,
      });
    }
  }

  console.log("--- MasterMasalahAndon Seed Completed Successfully ---");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
