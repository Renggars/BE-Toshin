import httpStatus from "http-status";
import bcrypt from "bcryptjs";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import redis from "../utils/redis.js";
import logger from "../config/logger.js";

const USER_CACHE_PREFIX = "user_list:";

/**
 * Invalidate all user list caches
 */
const invalidateUserCache = async () => {
  logger.info("[Redis] Invalidating User List Caches...");
  await redis.delByPattern(`${USER_CACHE_PREFIX}*`);
};

/**
 * Create a user (email and password are required, uid_nfc is optional)
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createUser = async (userBody) => {
  // Hash password
  const hashedPassword = await bcrypt.hash(userBody.password, 10);

  const result = await prisma.user.create({
    data: {
      nama: userBody.nama,
      email: userBody.email,
      password: hashedPassword,
      uidNfc: userBody.uidNfc || null,
      role: userBody.role,
      divisiId: userBody.divisiId,
      fotoProfile: userBody.fotoProfile || null,
      plant: userBody.plant,
      line: userBody.line,
      status: "active",
      noReg: userBody.noReg || null,
      // Set cycle start jika role-nya PRODUKSI
      pointCycleStart:
        userBody.role === "PRODUKSI" ? new Date(new Date().setDate(1)) : null,
    },
    include: {
      divisi: true,
    },
  });

  await invalidateUserCache();
  return result;
};

/**
 * Query for users without pagination (return all)
 * @param {Object} filter - Prisma filter
 * @returns {Promise<User[]>}
 */
const queryUsers = async (filter) => {
  // Check Cache First
  const cacheKey = `${USER_CACHE_PREFIX}${JSON.stringify(filter)}`;
  const cachedData = await redis.get(cacheKey);

  if (cachedData) {
    logger.info(
      `[Redis] Cache HIT: Serving User List from Redis. Filter: ${JSON.stringify(
        filter,
      )}`,
    );
    return cachedData;
  }

  logger.info("[Redis] Cache MISS: Fetching User List from Database...");
  const users = await prisma.user.findMany({
    where: filter,
    select: {
      id: true,
      fotoProfile: true,
      nama: true,
      email: true,
      role: true,
      divisi: {
        select: {
          id: true,
          namaDivisi: true,
        },
      },
      plant: true,
      line: true,
      status: true,
      currentPoint: true,
      noReg: true,
    },
  });

  // Set Cache
  await redis.set(cacheKey, users, 3600); // Cache for 1 hour
  logger.info("[Redis] Cache SET: User List cached successfully");

  return users;
};

/**
 * Get user by email
 * @param {string} email
 * @returns {Promise<User>}
 */
const getUserByEmail = async (email) => {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      nama: true,
      email: true,
      password: true,
      fotoProfile: true,
      role: true,
      plant: true,
      currentPoint: true,
      status: true,
      suspendedUntil: true,
      divisiId: true,
      noReg: true,
      divisi: {
        select: {
          id: true,
          namaDivisi: true,
        },
      },
    },
  });
};

/**
 * Get user by NFC UID
 * @param {string} uid_nfc
 * @returns {Promise<User>}
 */
const getUserByNfc = async (uidNfc) => {
  return prisma.user.findUnique({
    where: { uidNfc },
    select: {
      id: true,
      nama: true,
      fotoProfile: true,
      role: true,
      status: true,
      plant: true,
      currentPoint: true,
      suspendedUntil: true,
      divisiId: true,
      noReg: true,
      divisi: {
        select: {
          id: true,
          namaDivisi: true,
        },
      },
    },
  });
};

/**
 * Get user by ID
 * @param {number} userId
 * @returns {Promise<User>}
 */
const getUserById = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      divisi: true,
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return user;
};

/**
 * Get current user data (for /me endpoint)
 * @param {number} userId
 * @returns {Promise<User>}
 */
const getCurrentUserData = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      nama: true,
      email: true,
      uidNfc: true,
      fotoProfile: true,
      role: true,
      plant: true,
      currentPoint: true,
      status: true,
      suspendedUntil: true,
      pointCycleStart: true,
      divisiId: true,
      noReg: true,
      divisi: {
        select: {
          id: true,
          namaDivisi: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User not found");
  }

  return user;
};

/**
 * Update user by id
 * @param {number} userId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateUserById = async (userId, updateBody) => {
  await getUserById(userId);

  // Jika ada uidNfc, cek apakah sudah digunakan oleh user lain
  if (updateBody.uidNfc) {
    const userWithNfc = await prisma.user.findFirst({
      where: {
        uidNfc: updateBody.uidNfc,
        id: { not: userId }, // Pastikan bukan user yang sedang diupdate
      },
    });
 
    if (userWithNfc) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "UID NFC sudah digunakan oleh user lain",
      );
    }
  }

  // Hash password jika ada update password
  if (updateBody.password) {
    updateBody.password = await bcrypt.hash(updateBody.password, 10);
  }

  const result = await prisma.user.update({
    where: { id: userId },
    data: updateBody,
    include: {
      divisi: true,
    },
  });

  await invalidateUserCache();
  return result;
};

/**
 * Delete user by id
 * @param {number} userId
 * @returns {Promise<User>}
 */
const deactivateUserById = async (userId) => {
  await getUserById(userId);

  const result = await prisma.user.update({
    where: { id: userId },
    data: {
      status: "inactive",
      suspendedUntil: null,
    },
  });

  await invalidateUserCache();
  return result;
};

export default {
  createUser,
  queryUsers,
  getUserByEmail,
  getUserByNfc,
  getUserById,
  getCurrentUserData,
  updateUserById,
  deactivateUserById,
};
