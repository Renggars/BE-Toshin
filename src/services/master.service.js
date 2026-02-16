import prisma from "../../prisma/index.js";
import { calculateProductionTarget } from "../utils/productionCalc.js";

// --- Mesin ---
const getMesin = async () => {
  const allMesin = await prisma.mesin.findMany();

  // Group by kategori secara dinamis
  return allMesin.reduce((acc, mesin) => {
    const key = mesin.kategori.toLowerCase();
    if (!acc[key]) acc[key] = [];
    acc[key].push(mesin);
    return acc;
  }, {});
};

const createMesin = async (data) => {
  return prisma.mesin.create({ data });
};

const updateMesin = async (id, data) => {
  return prisma.mesin.update({ where: { id }, data });
};

const deleteMesin = async (id) => {
  return prisma.mesin.delete({ where: { id } });
};

// --- Produk ---
const getProduk = async () => {
  return prisma.produk.findMany();
};

const createProduk = async (data) => {
  return prisma.produk.create({ data });
};

const updateProduk = async (id, data) => {
  return prisma.produk.update({ where: { id }, data });
};

const deleteProduk = async (id) => {
  return prisma.produk.delete({ where: { id } });
};

// --- Jenis Pekerjaan ---
const getJenisPekerjaan = async () => {
  return prisma.jenisPekerjaan.findMany();
};

const createJenisPekerjaan = async (data) => {
  return prisma.jenisPekerjaan.create({ data });
};

// --- Shift ---
const getShift = async () => {
  return prisma.shift.findMany();
};

const createShift = async (data) => {
  return prisma.shift.create({ data });
};

const updateShift = async (id, data) => {
  return prisma.shift.update({ where: { id }, data });
};

const deleteShift = async (id) => {
  return prisma.shift.delete({ where: { id } });
};

// --- Target ---
const getTarget = async (filter, shiftId) => {
  // 1. Ambil data dari database dengan relasi
  const include = { jenis_pekerjaan: true, produk: true };
  const targetData =
    filter.fk_produk && filter.fk_jenis_pekerjaan
      ? await prisma.target.findFirst({ where: filter, include })
      : await prisma.target.findMany({ where: filter, include });

  if (!targetData) return targetData;

  // 2. Ambil data shift jika ada shiftId
  const shift = shiftId
    ? await prisma.shift.findUnique({ where: { id: shiftId } })
    : null;

  // 3. Function helper untuk formatting
  const formatTarget = (t) => {
    const formatted = {
      ...t,
      nama_pekerjaan: t.jenis_pekerjaan?.nama_pekerjaan,
      nama_produk: t.produk?.nama_produk,
    };

    // Hapus objek relasi agar response bersih
    delete formatted.jenis_pekerjaan;
    delete formatted.produk;

    // Hitung kalkulasi target jika data shift tersedia
    if (shift) {
      Object.assign(
        formatted,
        calculateProductionTarget(t.total_target, shift.tipe_shift),
      );
    }

    return formatted;
  };

  // 4. Return formatted data
  if (Array.isArray(targetData)) {
    return targetData.map(formatTarget);
  }

  return formatTarget(targetData);
};

const createTarget = async (data) => {
  return prisma.target.create({ data });
};

const updateTarget = async (id, data) => {
  return prisma.target.update({ where: { id }, data });
};

const deleteTarget = async (id) => {
  return prisma.target.delete({ where: { id } });
};

// --- Masalah Andon ---
const getMasalahAndon = async () => {
  return prisma.masterMasalahAndon.findMany();
};

const createMasalahAndon = async (data) => {
  return prisma.masterMasalahAndon.create({ data });
};

const updateMasalahAndon = async (id, data) => {
  return prisma.masterMasalahAndon.update({ where: { id }, data });
};

const deleteMasalahAndon = async (id) => {
  return prisma.masterMasalahAndon.delete({ where: { id } });
};

// --- Aggregated Master Data ---
const getAllMasterData = async () => {
  const [shift, mesin, jenisPekerjaan, produk] = await Promise.all([
    getShift(),
    getMesin(),
    getJenisPekerjaan(),
    getProduk(),
  ]);

  return {
    shift,
    mesin,
    jenisPekerjaan,
    produk,
  };
};

// --- Tipe Disiplin ---
const getTipeDisiplin = async () => {
  const [pelanggaran, penghargaan] = await Promise.all([
    prisma.tipeDisiplin.findMany({
      where: { kategori: "PELANGGARAN" },
    }),
    prisma.tipeDisiplin.findMany({
      where: { kategori: "PENGHARGAAN" },
    }),
  ]);

  return {
    pelanggaran,
    penghargaan,
  };
};

const createTipeDisiplin = async (data) => {
  return prisma.tipeDisiplin.create({ data });
};

const updateTipeDisiplin = async (id, data) => {
  return prisma.tipeDisiplin.update({ where: { id }, data });
};

const deleteTipeDisiplin = async (id) => {
  return prisma.tipeDisiplin.delete({ where: { id } });
};

const getAndonMasterData = async () => {
  const [shifts, machines] = await Promise.all([
    prisma.shift.findMany({
      select: { id: true, nama_shift: true },
    }),
    prisma.mesin.findMany({
      select: { id: true, nama_mesin: true },
    }),
  ]);

  return {
    shifts,
    machines,
    statuses: ["ACTIVE", "RESOLVED"],
  };
};

export default {
  // Mesin
  getMesin,
  createMesin,
  updateMesin,
  deleteMesin,
  // Produk
  getProduk,
  createProduk,
  updateProduk,
  deleteProduk,
  // Shift
  getShift,
  createShift,
  updateShift,
  deleteShift,
  // Target
  getTarget,
  createTarget,
  updateTarget,
  deleteTarget,
  // Masalah Andon
  getMasalahAndon,
  createMasalahAndon,
  updateMasalahAndon,
  deleteMasalahAndon,
  // Jenis Pekerjaan
  getJenisPekerjaan,
  createJenisPekerjaan,
  // Tipe Disiplin
  getTipeDisiplin,
  createTipeDisiplin,
  updateTipeDisiplin,
  deleteTipeDisiplin,
  // Aggregated
  getAllMasterData,
  getAndonMasterData,
};
