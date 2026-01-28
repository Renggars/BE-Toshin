import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";

/**
 * Create Produksi Log
 * @param {Object} payload
 * @returns {Promise<ProduksiLog>}
 */
const createProduksiLog = async (payload) => {
  const {
    fk_id_mesin,
    fk_id_shift,
    fk_id_operator,
    total_target,
    total_ok,
    total_ng,
    jam_mulai,
    jam_selesai,
    tanggal,
  } = payload;

  // 1. Validasi Relasi
  const [mesin, shift] = await Promise.all([
    prisma.mesin.findUnique({ where: { id: fk_id_mesin } }),
    prisma.shift.findUnique({ where: { id: fk_id_shift } }),
  ]);

  if (!mesin || !shift) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Mesin atau Shift tidak valid");
  }

  // 2. Create Log
  const log = await prisma.produksiLog.create({
    data: {
      fk_id_mesin,
      fk_id_shift,
      fk_id_operator: fk_id_operator || null,
      total_target,
      total_ok,
      total_ng,
      jam_mulai: new Date(jam_mulai),
      jam_selesai: new Date(jam_selesai),
      tanggal: new Date(tanggal),
    },
    include: {
      mesin: true,
      shift: true,
      operator: { select: { nama: true } },
    },
  });

  return log;
};

/**
 * Get Produksi Logs
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
const getProduksiLogs = async (filters) => {
  const { startDate, endDate, mesinId } = filters;

  const where = {};

  if (mesinId) {
    where.fk_id_mesin = parseInt(mesinId);
  }

  if (startDate && endDate) {
    where.tanggal = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  return prisma.produksiLog.findMany({
    where,
    include: {
      mesin: true,
      shift: true,
      operator: { select: { nama: true } },
    },
    orderBy: { tanggal: "desc" },
  });
};

export default {
  createProduksiLog,
  getProduksiLogs,
};
