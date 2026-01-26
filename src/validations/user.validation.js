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
      uid_nfc: Joi.string().optional(),
      fk_id_divisi: Joi.number().integer().optional(),
      role: Joi.string()
        .valid("OPERATOR", "SUPERVISOR", "ENGINEERING", "MAINTENANCE")
        .optional(),
      foto_profile: Joi.string().uri().allow(null, ""),
      status: Joi.string().valid("active", "suspended").optional(),
    })
    .min(1), // Minimal harus ada satu field yang diupdate
};

const deleteUser = {
  params: Joi.object().keys({
    userId: Joi.number().integer().required(),
  }),
};

export default {
  register,
  login,
  getUser,
  updateUser,
  deleteUser,
};
