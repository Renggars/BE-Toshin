// validations/rencanaProduksi.validation.js

import Joi from "joi";

const createRencanaProduksi = {
  body: Joi.object({
    fk_id_user: Joi.number().required(),
    fk_id_mesin: Joi.number().required(),
    fk_id_produk: Joi.number().required(),
    fk_id_shift: Joi.number().required(),
    fk_id_target: Joi.number().required(),
    fk_id_jenis_pekerjaan: Joi.number().integer().required(),
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
      fk_id_user: Joi.number().integer(),
      fk_id_mesin: Joi.number().integer(),
      fk_id_produk: Joi.number().integer(),
      fk_id_shift: Joi.number().integer(),
      fk_id_target: Joi.number().integer(),
      fk_id_jenis_pekerjaan: Joi.number().integer(),
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

export default {
  createRencanaProduksi,
  updateRencanaProduksi,
  deleteRencanaProduksi,
};
