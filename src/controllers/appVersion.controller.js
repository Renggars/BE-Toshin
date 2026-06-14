import fs from "fs/promises";
import path from "path";
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import ApiError from "../utils/ApiError.js";

const VERSION_FILE_PATH = path.join(
  process.cwd(),
  "storage",
  "app-version.json",
);

const getAppVersion = catchAsync(async (req, res) => {
  try {
    const data = await fs.readFile(VERSION_FILE_PATH, "utf-8");
    const versionInfo = JSON.parse(data);
    res.status(httpStatus.OK).send(versionInfo);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "File versi aplikasi tidak ditemukan",
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Gagal membaca data versi aplikasi",
    );
  }
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

  let versionInfo = {};
  try {
    const data = await fs.readFile(VERSION_FILE_PATH, "utf-8");
    versionInfo = JSON.parse(data);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Gagal membaca data versi aplikasi");
    }
  }

  // Hapus file lama jika ada untuk menghemat ruang disk
  if (versionInfo[platform] && versionInfo[platform].downloadUrl) {
    const oldUrl = versionInfo[platform].downloadUrl;
    if (oldUrl.startsWith("/app-releases/")) {
      const oldFileName = oldUrl.replace("/app-releases/", "");
      const oldFilePath = path.join(process.cwd(), "storage/releases", oldFileName);
      try {
        await fs.unlink(oldFilePath);
      } catch (err) {
        if (err.code !== "ENOENT") {
          console.error(`Gagal menghapus file lama ${oldFilePath}:`, err);
        }
      }
    }
  }

  const newDownloadUrl = `/app-releases/${req.file.filename}`;
  const today = new Date().toISOString().split("T")[0];

  versionInfo[platform] = {
    version,
    buildNumber: parseInt(buildNumber, 10),
    releaseDate: today,
    downloadUrl: newDownloadUrl,
    releaseNotes: releaseNotes || "",
    forceUpdate: forceUpdate === true || forceUpdate === "true",
    minVersion: minVersion || version,
  };

  await fs.mkdir(path.dirname(VERSION_FILE_PATH), { recursive: true });
  await fs.writeFile(VERSION_FILE_PATH, JSON.stringify(versionInfo, null, 2), "utf-8");

  res.status(httpStatus.OK).send({
    message: `Versi aplikasi ${platform} berhasil diperbarui`,
    data: versionInfo[platform],
  });
});

export default {
  getAppVersion,
  uploadAppVersion,
};

