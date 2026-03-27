import Joi from "joi";

const createTarget = {
  body: Joi.object().keys({
    produkId: Joi.number().required(),
    jenisPekerjaanId: Joi.number().integer().required(),
    shiftId: Joi.number().integer().optional(),
    totalTarget: Joi.number().required().min(1),
    idealCycleTime: Joi.number().required().min(0),
  }),
};

// --- Mesin ---
const createMesin = {
  body: Joi.object().keys({
    namaMesin: Joi.string().required(),
    kategori: Joi.string()
      .required()
      .valid(
        "PRESS",
        "SECONDARY",
        "PROGRESIVE_TRANSFER",
        "FINE_BLANKING",
        "TACI",
      ),
  }),
};

const updateMesin = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object()
    .keys({
      namaMesin: Joi.string(),
      kategori: Joi.string().valid(
        "PRESS",
        "SECONDARY",
        "PROGRESIVE_TRANSFER",
        "FINE_BLANKING",
        "TACI",
      ),
    })
    .min(1),
};

// --- Produk ---
const createProduk = {
  body: Joi.object().keys({
    namaProduk: Joi.string().required(),
  }),
};

const updateProduk = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object().keys({
    namaProduk: Joi.string().required(),
  }),
};

// --- Shift ---
const createShift = {
  body: Joi.object().keys({
    namaShift: Joi.string().required(),
    jamMasuk: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .required(), // HH:mm
    jamKeluar: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .required(),
    tipeShift: Joi.string().required(),
  }),
};

const updateShift = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object()
    .keys({
      namaShift: Joi.string(),
      jamMasuk: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      jamKeluar: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      tipeShift: Joi.string(),
    })
    .min(1),
};

// --- Masalah Andon ---
const createMasalahAndon = {
  body: Joi.object().keys({
    namaMasalah: Joi.string().required(),
    kategori: Joi.string().required(),
    waktuPerbaikanMenit: Joi.number().integer().required().min(0),
  }),
};

const updateMasalahAndon = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object()
    .keys({
      namaMasalah: Joi.string(),
      kategori: Joi.string(),
      waktuPerbaikanMenit: Joi.number().integer().min(0),
    })
    .min(1),
};

// --- Tipe Disiplin ---
const createTipeDisiplin = {
  body: Joi.object().keys({
    kode: Joi.string().required(),
    namaTipeDisiplin: Joi.string().required(),
    poin: Joi.number().integer().required(),
    kategori: Joi.string().required().valid("PELANGGARAN", "PENGHARGAAN"),
  }),
};

const updateTarget = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object()
    .keys({
      jenisPekerjaanId: Joi.number(),
      produkId: Joi.number(),
      totalTarget: Joi.number().min(1),
      idealCycleTime: Joi.number().min(0),
    })
    .min(1),
};

const deleteTarget = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
};

const updateTipeDisiplin = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object()
    .keys({
      kode: Joi.string(),
      namaTipeDisiplin: Joi.string(),
      poin: Joi.number().integer(),
      kategori: Joi.string().valid("PELANGGARAN", "PENGHARGAAN"),
    })
    .min(1),
};

export default {
  createTarget,
  updateTarget,
  deleteTarget,
  createMesin,
  updateMesin,
  createProduk,
  updateProduk,
  createShift,
  updateShift,
  createMasalahAndon,
  updateMasalahAndon,
  createTipeDisiplin,
  updateTipeDisiplin,
};
