import Joi from "joi";

const createLog = {
  body: Joi.object().keys({
    fk_id_mesin: Joi.number().required(),
    fk_id_shift: Joi.number().required(),
    fk_id_operator: Joi.number().allow(null),
    total_target: Joi.number().required(),
    total_ok: Joi.number().required(),
    total_ng: Joi.number().required(),
    jam_mulai: Joi.date().iso().required(),
    jam_selesai: Joi.date().iso().required(),
    tanggal: Joi.date().iso().required(),
  }),
};

export default {
  createLog,
};
