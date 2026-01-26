import Joi from "joi";

const createRencanaProduksi = {
  body: Joi.object({
    fk_id_user: Joi.number().required(),
    fk_id_mesin: Joi.number().required(),
    fk_id_produk: Joi.number().required(),
    fk_id_shift: Joi.number().required(),
    fk_id_target: Joi.number().required(),
    tanggal: Joi.date().required(),
    is_lembur: Joi.boolean().optional().default(false),
    target_lembur: Joi.number().integer().min(0).when("is_lembur", {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    keterangan: Joi.string().allow("", null),
  }),
};

export default {
  createRencanaProduksi,
};
