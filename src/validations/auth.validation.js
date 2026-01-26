import Joi from "joi";

const register = {
  body: Joi.object().keys({
    nama: Joi.string().required(),
    uid_nfc: Joi.string().required(),
    fk_id_divisi: Joi.number().integer().required(),
    role: Joi.string()
      .valid("OPERATOR", "SUPERVISOR", "ENGINEERING", "MAINTENANCE")
      .required(),
    foto_profile: Joi.string().uri().allow(null, ""),
  }),
};

const login = {
  body: Joi.object().keys({
    uid_nfc: Joi.string().required(),
  }),
};

export default { register, login };
