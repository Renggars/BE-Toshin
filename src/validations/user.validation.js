import Joi from "joi";
import { password } from "./custom.validation.js";

const register = {
  body: Joi.object().keys({
    nama: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().custom(password).required(),
    uidNfc: Joi.string().optional().allow(null, ""),
    divisiId: Joi.number().integer().required(),
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
    fotoProfile: Joi.string().uri().allow(null, ""),
    plant: Joi.string().valid("1", "2", "3").required(),
    line: Joi.string().required(),
    noReg: Joi.string().optional().allow(null, ""),
  }),
};

const login = {
  body: Joi.object().keys({
    uidNfc: Joi.string().required(),
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
      uidNfc: Joi.string().optional().allow(null, ""),
      divisiId: Joi.number().integer().optional(),
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
      fotoProfile: Joi.string().uri().allow(null, ""),
      plant: Joi.string().valid("1", "2", "3").optional(),
      line: Joi.string().optional(),
      noReg: Joi.string().optional().allow(null, ""),
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
