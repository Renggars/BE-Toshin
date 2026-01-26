import { PrismaClient } from "@prisma/client";
import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";

const prisma = new PrismaClient();

const createRencanaProduksi = async (payload) => {
  const {
    fk_id_user,
    fk_id_mesin,
    fk_id_produk,
    fk_id_shift,
    fk_id_target,
    tanggal,
    is_lembur = false,
    keterangan,
  } = payload;

  // Optional: validasi foreign key (lebih aman)
  const [user, mesin, produk, shift, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: fk_id_user } }),
    prisma.mesin.findUnique({ where: { id: fk_id_mesin } }),
    prisma.produk.findUnique({ where: { id: fk_id_produk } }),
    prisma.shift.findUnique({ where: { id: fk_id_shift } }),
    prisma.target.findUnique({ where: { id: fk_id_target } }),
  ]);

  if (!user || !mesin || !produk || !shift || !target) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Data relasi tidak valid (user/mesin/produk/shift/target)",
    );
  }

  return prisma.rencanaProduksi.create({
    data: {
      fk_id_user,
      fk_id_mesin,
      fk_id_produk,
      fk_id_shift,
      fk_id_target,
      tanggal: new Date(tanggal),
      is_lembur,
      target_lembur: data.is_lembur ? data.target_lembur : null,
      keterangan,
    },
  });
};

/**
 * Mendapatkan rencana produksi harian untuk operator tertentu
 * @param {number} userId
 * @param {string} tanggal - format YYYY-MM-DD
 */
const getRencanaProduksiHarian = async (userId, tanggalStr) => {
  const targetDate = new Date(tanggalStr);

  return prisma.rencanaProduksi.findFirst({
    where: {
      fk_id_user: userId,
      tanggal: targetDate,
    },
    include: {
      mesin: true,
      produk: true,
      shift: true,
      target: {
        include: {
          jenis_pekerjaan: true,
        },
      },
    },
  });
};

export default {
  createRencanaProduksi,
  getRencanaProduksiHarian,
};
