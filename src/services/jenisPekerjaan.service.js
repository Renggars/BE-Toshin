import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import redis from "../utils/redis.js";
import logger from "../config/logger.js";

const JENIS_PEKERJAAN_CACHE_KEY = "master_jenis_pekerjaan_all";
const MASTER_CACHE_KEY = "master_data_all";

const invalidateCache = async () => {
  logger.info("[Redis] Invalidating Jenis Pekerjaan and Master Cache...");
  await Promise.all([
    redis.del(JENIS_PEKERJAAN_CACHE_KEY),
    redis.del(MASTER_CACHE_KEY),
  ]);
};

/**
 * Create a jenis pekerjaan
 * @param {Object} jenisPekerjaanBody
 * @returns {Promise<JenisPekerjaan>}
 */
const createJenisPekerjaan = async (jenisPekerjaanBody) => {
  const existing = await prisma.jenisPekerjaan.findUnique({
    where: { nama_pekerjaan: jenisPekerjaanBody.nama_pekerjaan },
  });

  if (existing) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Jenis pekerjaan already exists",
    );
  }

  const result = await prisma.jenisPekerjaan.create({
    data: {
      nama_pekerjaan: jenisPekerjaanBody.nama_pekerjaan,
    },
  });

  await invalidateCache();
  return result;
};

/**
 * Query for all jenis pekerjaan
 * @returns {Promise<JenisPekerjaan[]>}
 */
const queryJenisPekerjaan = async () => {
  // Check Cache First
  const cachedData = await redis.get(JENIS_PEKERJAAN_CACHE_KEY);
  if (cachedData) {
    logger.info(
      `[Redis] Cache HIT: Serving Jenis Pekerjaan List from Redis. Summary: ${cachedData.length} items`,
    );
    return cachedData;
  }

  logger.info(
    "[Redis] Cache MISS: Fetching Jenis Pekerjaan List from Database...",
  );
  const result = await prisma.jenisPekerjaan.findMany({
    orderBy: {
      nama_pekerjaan: "asc",
    },
  });

  // Set Cache
  await redis.set(JENIS_PEKERJAAN_CACHE_KEY, result, 3600);
  logger.info("[Redis] Cache SET: Jenis Pekerjaan List cached successfully");

  return result;
};

/**
 * Get jenis pekerjaan by id
 * @param {number} id
 * @returns {Promise<JenisPekerjaan>}
 */
const getJenisPekerjaanById = async (id) => {
  const result = await prisma.jenisPekerjaan.findUnique({
    where: { id },
  });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Jenis pekerjaan not found");
  }

  return result;
};

/**
 * Update jenis pekerjaan by id
 * @param {number} id
 * @param {Object} updateBody
 * @returns {Promise<JenisPekerjaan>}
 */
const updateJenisPekerjaanById = async (id, updateBody) => {
  await getJenisPekerjaanById(id);

  if (updateBody.nama_pekerjaan) {
    const existing = await prisma.jenisPekerjaan.findUnique({
      where: { nama_pekerjaan: updateBody.nama_pekerjaan },
    });

    if (existing && existing.id !== id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Jenis pekerjaan name already exists",
      );
    }
  }

  const result = await prisma.jenisPekerjaan.update({
    where: { id },
    data: updateBody,
  });

  await invalidateCache();
  return result;
};

/**
 * Delete jenis pekerjaan by id
 * @param {number} id
 * @returns {Promise<JenisPekerjaan>}
 */
const deleteJenisPekerjaanById = async (id) => {
  await getJenisPekerjaanById(id);

  // Check if linked to RencanaProduksi
  const rphCount = await prisma.rencanaProduksi.count({
    where: { fk_id_jenis_pekerjaan: id },
  });

  if (rphCount > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot delete jenis pekerjaan linked to Rencana Produksi",
    );
  }

  // Check if linked to Target
  const targetCount = await prisma.target.count({
    where: { fk_jenis_pekerjaan: id },
  });

  if (targetCount > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot delete jenis pekerjaan linked to Target",
    );
  }

  const result = await prisma.jenisPekerjaan.delete({
    where: { id },
  });

  await invalidateCache();
  return result;
};

export default {
  createJenisPekerjaan,
  queryJenisPekerjaan,
  getJenisPekerjaanById,
  updateJenisPekerjaanById,
  deleteJenisPekerjaanById,
};
