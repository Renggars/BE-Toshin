import Joi from "joi";

const createTarget = {
  body: Joi.object().keys({
    fk_jenis_pekerjaan: Joi.number().required(),
    fk_produk: Joi.number().required(),
    total_target: Joi.number().required().min(1),
  }),
};

export default { createTarget };
