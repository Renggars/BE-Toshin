import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import redis from "../utils/redis.js";
import logger from "../config/logger.js";

const DIVISI_CACHE_KEY = "master_divisi_all";

const invalidateDivisiCache = async () => {
  logger.info("[Redis] Invalidating Divisi Cache...");
  await redis.del(DIVISI_CACHE_KEY);
};

/**
 * Create a divisi
 * @param {Object} divisiBody
 * @returns {Promise<Divisi>}
 */
const createDivisi = async (divisiBody) => {
  // Check if divisi already exists
  const existingDivisi = await prisma.divisi.findUnique({
    where: { nama_divisi: divisiBody.nama_divisi },
  });

  if (existingDivisi) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Divisi already exists");
  }

  const result = await prisma.divisi.create({
    data: {
      nama_divisi: divisiBody.nama_divisi,
    },
  });

  await invalidateDivisiCache();
  return result;
};

/**
 * Query for all divisi
 * @returns {Promise<Divisi[]>}
 */
const queryDivisi = async () => {
  // Check Cache First
  const cachedData = await redis.get(DIVISI_CACHE_KEY);
  if (cachedData) {
    logger.info(
      `[Redis] Cache HIT: Serving Divisi List from Redis. Summary: ${cachedData.length} divisions`,
    );
    return cachedData;
  }

  logger.info("[Redis] Cache MISS: Fetching Divisi List from Database...");
  const result = await prisma.divisi.findMany({
    orderBy: {
      nama_divisi: "asc",
    },
  });

  // Set Cache
  await redis.set(DIVISI_CACHE_KEY, result, 3600); // Cache for 1 hour
  logger.info("[Redis] Cache SET: Divisi List cached successfully");

  return result;
};

/**
 * Get divisi by id
 * @param {number} divisiId
 * @returns {Promise<Divisi>}
 */
const getDivisiById = async (divisiId) => {
  const divisi = await prisma.divisi.findUnique({
    where: { id: divisiId },
  });

  if (!divisi) {
    throw new ApiError(httpStatus.NOT_FOUND, "Divisi not found");
  }

  return divisi;
};

/**
 * Update divisi by id
 * @param {number} divisiId
 * @param {Object} updateBody
 * @returns {Promise<Divisi>}
 */
const updateDivisiById = async (divisiId, updateBody) => {
  await getDivisiById(divisiId);

  // Check if new nama_divisi already exists
  if (updateBody.nama_divisi) {
    const existingDivisi = await prisma.divisi.findUnique({
      where: { nama_divisi: updateBody.nama_divisi },
    });

    if (existingDivisi && existingDivisi.id !== divisiId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Divisi name already exists");
    }
  }

  const result = await prisma.divisi.update({
    where: { id: divisiId },
    data: updateBody,
  });

  await invalidateDivisiCache();
  return result;
};

/**
 * Delete divisi by id
 * @param {number} divisiId
 * @returns {Promise<Divisi>}
 */
const deleteDivisiById = async (divisiId) => {
  await getDivisiById(divisiId);

  // Check if divisi has users
  const userCount = await prisma.user.count({
    where: { fk_id_divisi: divisiId },
  });

  if (userCount > 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Cannot delete divisi with existing users",
    );
  }

  const result = await prisma.divisi.delete({
    where: { id: divisiId },
  });

  await invalidateDivisiCache();
  return result;
};

export default {
  createDivisi,
  queryDivisi,
  getDivisiById,
  updateDivisiById,
  deleteDivisiById,
};
