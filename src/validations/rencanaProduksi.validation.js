// validations/rencanaProduksi.validation.js

import Joi from "joi";

const createRencanaProduksi = {
  body: Joi.object({
    userId: Joi.number().required(),
    mesinId: Joi.number().required(),
    produkId: Joi.number().required(),
    shiftId: Joi.number().required(),
    targetId: Joi.number().required(),
    jenisPekerjaanId: Joi.number().integer().required(),
    tanggal: Joi.date().required(),
    keterangan: Joi.string().allow("", null),
  }),
};

const updateRencanaProduksi = {
  params: Joi.object().keys({
    rphId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      userId: Joi.number().integer(),
      mesinId: Joi.number().integer(),
      produkId: Joi.number().integer(),
      shiftId: Joi.number().integer(),
      targetId: Joi.number().integer(),
      jenisPekerjaanId: Joi.number().integer(),
      tanggal: Joi.date(),
      keterangan: Joi.string().allow("", null),
      status: Joi.string().valid(
        "PLANNED",
        "WAITING_START",
        "ACTIVE",
        "CLOSED",
      ),
    })
    .min(1),
};

const deleteRencanaProduksi = {
  params: Joi.object().keys({
    rphId: Joi.number().integer().required(),
  }),
};

const getMyRPH = {
  query: Joi.object().keys({
    tanggal: Joi.string().isoDate().optional(), // YYYY-MM-DD
  }),
};

export default {
  createRencanaProduksi,
  updateRencanaProduksi,
  deleteRencanaProduksi,
  getMyRPH,
};
