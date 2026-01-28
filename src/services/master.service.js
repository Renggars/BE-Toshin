import prisma from "../../prisma/index.js";

// --- Mesin ---
const getMesin = async () => {
  return prisma.mesin.findMany();
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
const getTarget = async (filter) => {
  if (filter.fk_produk && filter.fk_jenis_pekerjaan) {
    return prisma.target.findFirst({
      where: filter,
    });
  }
  return prisma.target.findMany({ where: filter });
};

const createTarget = async (data) => {
  return prisma.target.create({ data });
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
  // Masalah Andon
  getMasalahAndon,
  createMasalahAndon,
  updateMasalahAndon,
  deleteMasalahAndon,
};
