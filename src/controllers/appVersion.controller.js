import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import ApiError from "../utils/ApiError.js";

const prisma = new PrismaClient();
const VERSION_FILE_PATH = path.join(process.cwd(), "storage", "app-version.json");

/**
 * Inisialisasi awal (Migrasi dari JSON ke Database jika database kosong)
 */


/**
 * Inisialisasi awal (Migrasi dari JSON ke Database jika database kosong)
 */
const getOrMigrateInitialData = async () => {
  const count = await prisma.appVersion.count();
  if (count === 0) {
    try {
      const data = await fs.readFile(VERSION_FILE_PATH, "utf-8");
      const versionInfo = JSON.parse(data);

      const platforms = ["android", "windows"];
      for (const platform of platforms) {
        if (versionInfo[platform]) {
          const info = versionInfo[platform];
          await prisma.appVersion.create({
            data: {
              platform,
              version: info.version,
              buildNumber: parseInt(info.buildNumber, 10),
              releaseDate: new Date(info.releaseDate),
              downloadUrl: info.downloadUrl,
              releaseNotes: info.releaseNotes || "",
              forceUpdate: info.forceUpdate === true,
              minVersion: info.minVersion || info.version,
            }
          });
        }
      }
      console.log("Inisialisasi data versi awal dari JSON ke database sukses.");
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Gagal mengimigrasikan data versi awal dari JSON:", error);
      }
    }
  }
};

const getAppVersion = catchAsync(async (req, res) => {
  // Jalankan migrasi awal jika database kosong
  await getOrMigrateInitialData();

  const versions = await prisma.appVersion.findMany();
  // Format data kembali ke struktur JSON yang diharapkan Client
  const formattedInfo = {};
  versions.forEach(v => {
    formattedInfo[v.platform] = {
      version: v.version,
      buildNumber: v.buildNumber,
      releaseDate: v.releaseDate.toISOString().split("T")[0],
      downloadUrl: v.downloadUrl,
      releaseNotes: v.releaseNotes,
      forceUpdate: v.forceUpdate,
      minVersion: v.minVersion,
    };
  });

  res.status(httpStatus.OK).send(formattedInfo);
});

const uploadAppVersion = catchAsync(async (req, res) => {
  const { platform } = req.params;
  const { version, buildNumber, releaseNotes, forceUpdate, minVersion } = req.body;

  if (platform !== "android" && platform !== "windows") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Platform harus 'android' atau 'windows'");
  }

  if (!version || !buildNumber) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Versi dan nomor build wajib diisi");
  }

  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "File aplikasi (.apk / .exe) wajib diunggah");
  }

  // 1. Ambil data versi lama untuk proses penghapusan file lama di server
  const existingVersion = await prisma.appVersion.findUnique({
    where: { platform }
  });

  if (existingVersion && existingVersion.downloadUrl) {
    const oldUrl = existingVersion.downloadUrl;
    if (oldUrl.startsWith("/app-releases/")) {
      const oldFileName = oldUrl.replace("/app-releases/", "");
      const oldFilePath = path.join(process.cwd(), "storage/releases", oldFileName);
      try {
        await fs.unlink(oldFilePath);
      } catch (err) {
        if (err.code !== "ENOENT") {
          console.error(`Gagal menghapus file lama di server ${oldFilePath}:`, err);
        }
      }
    }
  }

  // 2. Simpan atau perbarui versi baru ke database menggunakan UPSERT
  const newDownloadUrl = `/app-releases/${req.file.filename}`;
  const today = new Date();

  const updatedVersion = await prisma.appVersion.upsert({
    where: { platform },
    update: {
      version,
      buildNumber: parseInt(buildNumber, 10),
      releaseDate: today,
      downloadUrl: newDownloadUrl,
      releaseNotes: releaseNotes || "",
      forceUpdate: forceUpdate === true || forceUpdate === "true",
      minVersion: minVersion || version,
    },
    create: {
      platform,
      version,
      buildNumber: parseInt(buildNumber, 10),
      releaseDate: today,
      downloadUrl: newDownloadUrl,
      releaseNotes: releaseNotes || "",
      forceUpdate: forceUpdate === true || forceUpdate === "true",
      minVersion: minVersion || version,
    }
  });

  res.status(httpStatus.OK).send({
    message: `Versi aplikasi ${platform} berhasil diperbarui di database`,
    data: {
      version: updatedVersion.version,
      buildNumber: updatedVersion.buildNumber,
      releaseDate: updatedVersion.releaseDate.toISOString().split("T")[0],
      downloadUrl: updatedVersion.downloadUrl,
      releaseNotes: updatedVersion.releaseNotes,
      forceUpdate: updatedVersion.forceUpdate,
      minVersion: updatedVersion.minVersion,
    },
  });
});

export default {
  getAppVersion,
  uploadAppVersion,
};

