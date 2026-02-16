import Joi from "joi";

const trigger = {
  body: Joi.object({
    fk_id_mesin: Joi.number().required(),
    fk_id_masalah: Joi.number().required(),
    fk_id_operator: Joi.number().optional(),
  }),
};

const call = {
  body: Joi.object({
    fk_id_mesin: Joi.number().required(),
    target_divisi: Joi.string()
      .valid("MAINTENANCE", "QUALITY", "PRODUKSI", "DIE_MAINT")
      .required(),
  }),
};

const resolve = {
  params: Joi.object({
    id: Joi.number().required(),
  }),
};

const getDashboard = {
  query: Joi.object().keys({
    date: Joi.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .message("Format date harus YYYY-MM-DD")
      .optional(),
    shiftId: Joi.number().integer().optional(),
    plantId: Joi.alternatives()
      .try(Joi.string(), Joi.number())
      .optional()
      .default("Semua Plant"),
    mesinId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
    status: Joi.string().valid("ACTIVE", "RESOLVED", "Semua Status").optional(),
    kategori: Joi.string().optional().default("Semua Kategori"),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    onlyHistory: Joi.boolean().optional(),
  }),
};

export default { trigger, call, resolve, getDashboard };
