import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";

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

  return prisma.jenisPekerjaan.create({
    data: {
      nama_pekerjaan: jenisPekerjaanBody.nama_pekerjaan,
    },
  });
};

/**
 * Query for all jenis pekerjaan
 * @returns {Promise<JenisPekerjaan[]>}
 */
const queryJenisPekerjaan = async () => {
  return prisma.jenisPekerjaan.findMany({
    orderBy: {
      nama_pekerjaan: "asc",
    },
  });
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

  return prisma.jenisPekerjaan.update({
    where: { id },
    data: updateBody,
  });
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

  return prisma.jenisPekerjaan.delete({
    where: { id },
  });
};

export default {
  createJenisPekerjaan,
  queryJenisPekerjaan,
  getJenisPekerjaanById,
  updateJenisPekerjaanById,
  deleteJenisPekerjaanById,
};
