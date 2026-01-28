import Joi from "joi";
import { password } from "./custom.validation.js";

const register = {
  body: Joi.object().keys({
    nama: Joi.string().required(),
    email: Joi.string().email().optional(), // required()
    password: Joi.string().custom(password).optional(), // required()
    uid_nfc: Joi.string().required(),
    fk_id_divisi: Joi.number().integer().required(),
    role: Joi.string()
      .valid("OPERATOR", "SUPERVISOR", "ENGINEERING", "MAINTENANCE", "ADMIN")
      .required(),
    foto_profile: Joi.string().uri().allow(null, ""),
    plant: Joi.string().allow(null, ""),
  }),
};

const login = {
  body: Joi.object().keys({
    uid_nfc: Joi.string(),
    email: Joi.string().email(),
    password: Joi.string(),
  }),
};

export default { register, login };
