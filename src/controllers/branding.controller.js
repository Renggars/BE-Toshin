import fs from "fs/promises";
import path from "path";
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";

const BRANDING_FILE_PATH = path.join(process.cwd(), "storage", "branding.json");

const getBackground = catchAsync(async (req, res) => {
  let brandingInfo = { backgroundImageUrl: "" };
  try {
    const data = await fs.readFile(BRANDING_FILE_PATH, "utf-8");
    brandingInfo = JSON.parse(data);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Gagal membaca data branding");
    }
  }

  // Tambahkan base URL jika path bertipe relatif
  if (brandingInfo.backgroundImageUrl && brandingInfo.backgroundImageUrl.startsWith("/")) {
    const baseUrl = req.protocol + "://" + req.get("host");
    brandingInfo.backgroundImageUrl = baseUrl + brandingInfo.backgroundImageUrl;
  }

  res.status(httpStatus.OK).send(brandingInfo);
});

const uploadBackground = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "File gambar harus diunggah");
  }

  const relativePath = `/uploads/branding-images/${req.file.filename}`;
  let oldImage = null;
  let brandingInfo = { backgroundImageUrl: "" };

  try {
    const data = await fs.readFile(BRANDING_FILE_PATH, "utf-8");
    brandingInfo = JSON.parse(data);
    oldImage = brandingInfo.backgroundImageUrl;
  } catch (error) {
    if (error.code !== "ENOENT") {
      logger.error("Gagal membaca file branding lama: " + error.message);
    }
  }

  // Update konfigurasi
  brandingInfo.backgroundImageUrl = relativePath;
  await fs.writeFile(BRANDING_FILE_PATH, JSON.stringify(brandingInfo, null, 2), "utf-8");

  // Hapus file lama untuk efisiensi penyimpanan
  if (oldImage && oldImage.startsWith("/uploads/")) {
    const oldPath = path.join(process.cwd(), "public", oldImage);
    try {
      await fs.unlink(oldPath);
    } catch (err) {
      if (err.code !== "ENOENT") {
        logger.error(`Gagal menghapus file lama (${oldPath}): ` + err.message);
      }
    }
  }

  const baseUrl = req.protocol + "://" + req.get("host");
  res.status(httpStatus.OK).send({
    message: "Background image berhasil diperbarui",
    backgroundImageUrl: baseUrl + relativePath,
  });
});

export default {
  getBackground,
  uploadBackground,
};
