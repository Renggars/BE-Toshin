import Joi from "joi";
import { password } from "./custom.validation.js";

const register = {
  body: Joi.object().keys({
    nama: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().custom(password).required(),
    fk_id_divisi: Joi.number().integer().required(),
    role: Joi.string()
      .valid(
        "PRODUKSI",
        "QUALITY",
        "MAINTENANCE",
        "DIE_MAINT",
        "ENGINEERING",
        "MARKETING",
        "COMMERCIAL",
        "PPIC",
        "HCPGA",
        "WRH_CIBITUNG",
        "GA",
        "WAREHOUSE",
        "PURCHASING",
        "HC",
        "ACCOUNTING",
        "FINANCE",
        "SUPERVISOR",
        "ADMIN",
      )
      .required(),
    foto_profile: Joi.string().uri().allow(null, ""),
    plant: Joi.string().valid("1", "2", "3").required(),
    line: Joi.string().required(),
    no_reg: Joi.string().optional().allow(null, ""),
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
