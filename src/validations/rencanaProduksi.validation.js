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

export default {
  createRencanaProduksi,
};
