import Joi from "joi";

const createTarget = {
  body: Joi.object().keys({
    fk_jenis_pekerjaan: Joi.number().required(),
    fk_produk: Joi.number().required(),
    total_target: Joi.number().required().min(1),
  }),
};

// --- Mesin ---
const createMesin = {
  body: Joi.object().keys({
    nama_mesin: Joi.string().required(),
    ideal_cycle_time: Joi.number().required().min(0),
  }),
};

const updateMesin = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object()
    .keys({
      nama_mesin: Joi.string(),
      ideal_cycle_time: Joi.number().min(0),
    })
    .min(1),
};

// --- Produk ---
const createProduk = {
  body: Joi.object().keys({
    nama_produk: Joi.string().required(),
  }),
};

const updateProduk = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object().keys({
    nama_produk: Joi.string().required(),
  }),
};

// --- Shift ---
const createShift = {
  body: Joi.object().keys({
    nama_shift: Joi.string().required(),
    jam_masuk: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .required(), // HH:mm
    jam_keluar: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .required(),
    tipe_shift: Joi.string().required(),
  }),
};

const updateShift = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object()
    .keys({
      nama_shift: Joi.string(),
      jam_masuk: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      jam_keluar: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      tipe_shift: Joi.string(),
    })
    .min(1),
};

// --- Masalah Andon ---
const createMasalahAndon = {
  body: Joi.object().keys({
    nama_masalah: Joi.string().required(),
    kategori: Joi.string().required(),
    waktu_perbaikan: Joi.string().allow(null, ""), // Expect "HH:mm:ss" or null
  }),
};

const updateMasalahAndon = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object()
    .keys({
      nama_masalah: Joi.string(),
      kategori: Joi.string(),
      waktu_perbaikan: Joi.string().allow(null, ""),
      deskripsi: Joi.string().allow(null, ""),
    })
    .min(1),
};

export default {
  createTarget,
  createMesin,
  updateMesin,
  createProduk,
  updateProduk,
  createShift,
  updateShift,
  createMasalahAndon,
  updateMasalahAndon,
};
