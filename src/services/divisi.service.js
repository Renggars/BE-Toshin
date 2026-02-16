import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";

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

  return prisma.divisi.create({
    data: {
      nama_divisi: divisiBody.nama_divisi,
    },
  });
};

/**
 * Query for all divisi
 * @returns {Promise<Divisi[]>}
 */
const queryDivisi = async () => {
  return prisma.divisi.findMany({
    orderBy: {
      nama_divisi: "asc",
    },
  });
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

  return prisma.divisi.update({
    where: { id: divisiId },
    data: updateBody,
  });
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

  return prisma.divisi.delete({
    where: { id: divisiId },
  });
};

export default {
  createDivisi,
  queryDivisi,
  getDivisiById,
  updateDivisiById,
  deleteDivisiById,
};
