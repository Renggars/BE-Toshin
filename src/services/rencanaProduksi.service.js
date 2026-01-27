// src/service/rencanaProduksi.service.js

import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";

import prisma from "../../prisma/index.js";

const createRencanaProduksi = async (payload) => {
  const {
    fk_id_user,
    fk_id_mesin,
    fk_id_produk,
    fk_id_shift,
    fk_id_target,
    tanggal,
    keterangan,
  } = payload;

  // 1. Validasi foreign key
  const [user, mesin, produk, shift, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: fk_id_user },
      include: { divisi: true },
    }),
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

  // 2. Cek apakah rph sudah ada untuk operator tersebut di tanggal yang sama
  const existingRph = await prisma.rencanaProduksi.findFirst({
    where: {
      fk_id_user,
      tanggal: new Date(tanggal),
    },
  });

  if (existingRph) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Rencana produksi untuk operator ini pada tanggal tersebut sudah ada",
    );
  }

  // 3. Simpan rencana produksi (Tanpa field lembur sesuai schema baru)
  return prisma.rencanaProduksi.create({
    data: {
      fk_id_user,
      fk_id_mesin,
      fk_id_produk,
      fk_id_shift,
      fk_id_target,
      tanggal: new Date(tanggal),
      keterangan,
    },
    include: {
      user: { include: { divisi: true } },
      mesin: true,
      produk: true,
      shift: true,
      target: { include: { jenis_pekerjaan: true } },
    },
  });
};
/**
 * Mendapatkan rencana produksi harian untuk operator tertentu
 * @param {number} userId
 * @param {string} tanggal - format YYYY-MM-DD
 */
const getRencanaProduksiHarian = async (userId, tanggalStr) => {
  const rp = await prisma.rencanaProduksi.findFirst({
    where: {
      fk_id_user: userId,
      tanggal: new Date(tanggalStr),
    },
    include: {
      mesin: true,
      produk: true,
      shift: true,
      target: {
        include: { jenis_pekerjaan: true },
      },
    },
  });

  if (!rp) return null;

  // 4. Logika Perhitungan Target Berdasarkan Tipe Shift
  let baseTarget = rp.target.total_target;
  let finalTarget = baseTarget;

  // Aturan: Long Shift +30%, Group +15%
  if (rp.shift.tipe_shift === "Long Shift") {
    finalTarget = Math.round(baseTarget * 1.3);
  } else if (rp.shift.tipe_shift === "Group") {
    finalTarget = Math.round(baseTarget * 1.15);
  }

  return {
    mesin: rp.mesin.nama_mesin,
    produk: rp.produk.nama_produk,
    shift: `${rp.shift.nama_shift} (${rp.shift.jam_masuk} - ${rp.shift.jam_keluar})`,
    tipe_shift: rp.shift.tipe_shift,
    target_database: baseTarget,
    total_target: finalTarget, // Target yang sudah dikalkulasi
    jenis_pekerjaan: rp.target.jenis_pekerjaan.nama_pekerjaan,
    catatan_produksi: rp.keterangan || "Tidak ada catatan untuk hari ini",
  };
};

export default {
  createRencanaProduksi,
  getRencanaProduksiHarian,
};
