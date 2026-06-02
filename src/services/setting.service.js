// src/services/setting.service.js
import fs from "fs";
import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";

/**
 * Get setting by key
 * @param {string} key
 * @returns {Promise<SystemSetting>}
 */
const getSetting = async (key) => {
  return prisma.systemSetting.findUnique({
    where: { key },
  });
};

/**
 * Update or create setting
 * @param {string} key
 * @param {string} value
 * @returns {Promise<SystemSetting>}
 */
const updateSetting = async (key, value) => {
  return prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
};

/**
 * Update login background image
 * @param {Object} file - multer file object
 * @returns {Promise<SystemSetting>}
 */
const updateLoginBackground = async (file) => {
  if (!file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "File gambar tidak ditemukan");
  }

  const key = "login_background";
  const existing = await getSetting(key);

  const pathFile = file.path.replace(/\\/g, "/"); // Normalize Windows backslash

  const setting = await updateSetting(key, pathFile);

  // Hapus file lama jika ada
  if (existing && existing.value && fs.existsSync(existing.value)) {
    fs.unlink(existing.value, (err) => {
      if (err) console.error("Gagal hapus file background lama:", err);
    });
  }

  return setting;
};

export default {
  getSetting,
  updateSetting,
  updateLoginBackground,
};
