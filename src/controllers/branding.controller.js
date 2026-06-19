import fs from "fs/promises";
import path from "path";
import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import catchAsync from "../utils/catchAsync.js";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";

const SETTING_KEY = "branding_background";

const getBackground = catchAsync(async (req, res) => {
  let backgroundImageUrl = "";

  const setting = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEY },
  });

  if (setting) {
    backgroundImageUrl = setting.value;
  }

  // Tambahkan base URL jika path bertipe relatif
  if (backgroundImageUrl && backgroundImageUrl.startsWith("/")) {
    const baseUrl = req.protocol + "://" + req.get("host");
    backgroundImageUrl = baseUrl + backgroundImageUrl;
  }

  res.status(httpStatus.OK).send({ backgroundImageUrl });
});

const uploadBackground = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "File gambar harus diunggah");
  }

  const relativePath = `/uploads/branding-images/${req.file.filename}`;
  let oldImage = null;

  // Cek pengaturan lama di database
  const oldSetting = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEY },
  });

  if (oldSetting) {
    oldImage = oldSetting.value;
  }

  // Update atau insert (upsert) konfigurasi di database
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: relativePath },
    create: {
      key: SETTING_KEY,
      value: relativePath,
    },
  });

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

const deleteBackground = catchAsync(async (req, res) => {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEY },
  });

  if (!setting) {
    throw new ApiError(httpStatus.NOT_FOUND, "Background image tidak ditemukan");
  }

  const imagePath = setting.value;

  // Hapus dari database
  await prisma.systemSetting.delete({
    where: { key: SETTING_KEY },
  });

  // Hapus file dari filesystem
  if (imagePath && imagePath.startsWith("/uploads/")) {
    const filePath = path.join(process.cwd(), "public", imagePath);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== "ENOENT") {
        logger.error(`Gagal menghapus file (${filePath}): ` + err.message);
      }
    }
  }

  res.status(httpStatus.OK).send({
    message: "Background image berhasil dihapus",
  });
});

export default {
  getBackground,
  uploadBackground,
  deleteBackground,
};

