import Joi from "joi";

const fotoFileSchema = Joi.object()
  .keys({
    mimetype: Joi.string()
      .valid("image/jpeg", "image/jpg", "image/png", "image/webp")
      .required(),
    size: Joi.number()
      .max(5 * 1024 * 1024)  // 5MB
      .required(),
  })
  .unknown(true)
  .optional();

const createPelanggaran = {
  body: Joi.object()
    .keys({
      // Either uid_nfc OR fk_id_operator must be provided
      uidNfc: Joi.string().optional(),
      operatorId: Joi.number().integer().optional(),
      tipeDisiplinId: Joi.number().integer().required(),
      shiftId: Joi.number().integer().required(), // Reverted to required
      keterangan: Joi.string().allow("", null).optional(),
    })
    .or("uidNfc", "operatorId") // At least one must be present
    .unknown(true), // Allow "foto" and other multipart fields
  file: fotoFileSchema,
};

const createPelanggaranByNfc = {
  body: Joi.object().keys({
    uidNfc: Joi.string().required(),
    tipeDisiplinId: Joi.number().integer().required(),
    shiftId: Joi.number().integer().required(), // Reverted to required
    keterangan: Joi.string().optional(),
  }).unknown(true), // Allow extra fields
  file: fotoFileSchema,
};

const getHistory = {
  query: Joi.object().keys({
    plant: Joi.string(),
    tanggal: Joi.date().iso(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
};

const updatePoinDisiplin = {
  params: Joi.object().keys({
    id: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      tipeDisiplinId: Joi.number().integer(),
      shiftId: Joi.number().integer(),
      keterangan: Joi.string().allow("", null),
      tanggal: Joi.date().iso(),
      poinBerubah: Joi.number().integer(),
    })
    .min(1),
};

export default {
  createPelanggaran,
  createPelanggaranByNfc,
  getHistory,
  updatePoinDisiplin,
};
