import httpStatus from "http-status";
import bcrypt from "bcryptjs";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";

/**
 * Create a user (All fields: email, password, uid_nfc are required)
 * @param {Object} userBody
 * @returns {Promise<User>}
 */
const createUser = async (userBody) => {
  // Hash password
  const hashedPassword = await bcrypt.hash(userBody.password, 10);

  return prisma.user.create({
    data: {
      nama: userBody.nama,
      email: userBody.email,
      password: hashedPassword,
      uid_nfc: userBody.uid_nfc,
      role: userBody.role,
      fk_id_divisi: userBody.fk_id_divisi,
      foto_profile: userBody.foto_profile || null,
      plant: userBody.plant || null,
      status: "active",
      // Set cycle start jika role-nya OPERATOR
      point_cycle_start:
        userBody.role === "OPERATOR" ? new Date(new Date().setDate(1)) : null,
    },
    include: {
      divisi: true,
    },
  });
};

/**
 * Query for users with pagination
 * @param {Object} filter - Prisma filter
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>}
 */
const queryUsers = async (filter, options) => {
  const page = parseInt(options.page || 1);
  const limit = parseInt(options.limit || 10);
  const skip = (page - 1) * limit;

  const users = await prisma.user.findMany({
    skip,
    take: limit,
    where: filter,
    include: {
      divisi: true,
    },
  });

  const totalItems = await prisma.user.count({ where: filter });
  const totalPages = Math.ceil(totalItems / limit);

  return {
    users,
    pagination: {
      totalItems,
      totalPages,
      currentPage: page,
    },
  };
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
      foto_profile: true,
      role: true,
      status: true,
      suspended_until: true,
      fk_id_divisi: true,
      divisi: {
        select: {
          id: true,
          nama_divisi: true,
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
const getUserByNfc = async (uid_nfc) => {
  return prisma.user.findUnique({
    where: { uid_nfc },
    select: {
      id: true,
      nama: true,
      foto_profile: true,
      role: true,
      status: true,
      suspended_until: true,
      fk_id_divisi: true,
      divisi: {
        select: {
          id: true,
          nama_divisi: true,
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
      uid_nfc: true,
      foto_profile: true,
      role: true,
      plant: true,
      current_point: true,
      status: true,
      suspended_until: true,
      point_cycle_start: true,
      fk_id_divisi: true,
      divisi: {
        select: {
          id: true,
          nama_divisi: true,
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

  // Hash password jika ada update password
  if (updateBody.password) {
    updateBody.password = await bcrypt.hash(updateBody.password, 10);
  }

  return prisma.user.update({
    where: { id: userId },
    data: updateBody,
    include: {
      divisi: true,
    },
  });
};

/**
 * Delete user by id
 * @param {number} userId
 * @returns {Promise<User>}
 */
const deactivateUserById = async (userId) => {
  await getUserById(userId);

  return prisma.user.update({
    where: { id: userId },
    data: {
      status: "inactive",
      suspended_until: null,
    },
  });
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
