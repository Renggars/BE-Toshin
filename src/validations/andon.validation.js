import Joi from "joi";

const triggerAndon = {
  body: Joi.object().keys({
    fk_id_mesin: Joi.number().required(),
    fk_id_masalah: Joi.number().required(),
    fk_id_operator: Joi.number().allow(null), // Optional, bisa null jika dari ESP32 tanpa input operator
  }),
};

const resolveAndon = {
  params: Joi.object().keys({
    eventId: Joi.number().required(),
  }),
  body: Joi.object().keys({
    catatan: Joi.string().allow("", null),
  }),
};

export default {
  triggerAndon,
  resolveAndon,
};
