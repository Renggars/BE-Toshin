import Joi from "joi";
import { password } from "./custom.validation.js";

const register = {
  body: Joi.object().keys({
    nama: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().custom(password).required(),
    uid_nfc: Joi.string().optional().allow(null, ""),
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
    uid_nfc: Joi.string().required(),
  }),
};

const getUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer().required(),
  }),
};

const updateUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      nama: Joi.string().optional(),
      email: Joi.string().email().optional(),
      password: Joi.string().custom(password).optional(),
      uid_nfc: Joi.string().optional().allow(null, ""),
      fk_id_divisi: Joi.number().integer().optional(),
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
        .optional(),
      foto_profile: Joi.string().uri().allow(null, ""),
      plant: Joi.string().valid("1", "2", "3").optional(),
      line: Joi.string().optional(),
      no_reg: Joi.string().optional().allow(null, ""),
    })
    .min(1), // Minimal harus ada satu field yang diupdate
};

const deactivateUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer().required(),
  }),
};

export default {
  register,
  login,
  getUser,
  updateUser,
  deactivateUser,
};
