import Joi from "joi";

const createTask = {
  body: Joi.object().keys({
    mandorId: Joi.number().integer().required(),
    judul: Joi.string().required(),
    deskripsi: Joi.string().required(),
    prioritas: Joi.string().valid("LOW", "MEDIUM", "HIGH").optional(),
    catatan: Joi.string().optional().allow(null, ""),
    foto: Joi.string().optional().allow(null, ""),
  }),
};

const updateStatus = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().required().valid("TODO", "ON_PROGRESS", "DONE"),
    catatan: Joi.string().optional().allow(null, ""),
    foto: Joi.string().optional().allow(null, ""),
  }),
};

const deleteTask = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
};

export default {
  createTask,
  updateStatus,
  deleteTask,
};
