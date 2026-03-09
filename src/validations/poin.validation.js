import Joi from "joi";

const createPelanggaran = {
  body: Joi.object()
    .keys({
      // Either uid_nfc OR fk_id_operator must be provided
      uid_nfc: Joi.string().optional(),
      fk_id_operator: Joi.number().integer().optional(),
      fk_tipe_disiplin: Joi.number().integer().required(),
      fk_id_shift: Joi.number().integer().required(),
      keterangan: Joi.string().optional(),
    })
    .or("uid_nfc", "fk_id_operator"), // At least one must be present
  file: Joi.object()
    .keys({
      mimetype: Joi.string()
        .valid("image/jpeg", "image/jpg", "image/png", "image/webp")
        .required(),
      size: Joi.number()
        .max(1024 * 1024)
        .required(), // 1MB
    })
    .unknown(true)
    .optional(),
};

const createPelanggaranByNfc = {
  body: Joi.object().keys({
    uid_nfc: Joi.string().required(),
    fk_tipe_disiplin: Joi.number().integer().required(),
    fk_id_shift: Joi.number().integer().required(),
    keterangan: Joi.string().optional(),
  }),
  file: Joi.object()
    .keys({
      mimetype: Joi.string()
        .valid("image/jpeg", "image/jpg", "image/png", "image/webp")
        .required(),
      size: Joi.number()
        .max(1024 * 1024)
        .required(), // 1MB
    })
    .unknown(true)
    .optional(),
};

const getHistory = {
  query: Joi.object().keys({
    plant: Joi.string(),
    tanggal: Joi.date().iso(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
};

export default {
  createPelanggaran,
  createPelanggaranByNfc,
  getHistory,
};
