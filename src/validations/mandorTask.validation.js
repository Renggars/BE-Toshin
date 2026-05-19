import Joi from "joi";

const createTask = {
  body: Joi.object().keys({
    mandorId: Joi.number().integer().required(),
    judul: Joi.string().required(),
    deskripsi: Joi.string().required(),
    prioritas: Joi.string().valid("LOW", "MEDIUM", "HIGH").optional(),
    foto: Joi.string().allow(null, "").optional(),
  }),
};

const updateTask = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object().keys({
    mandorId: Joi.number().integer().optional(),
    judul: Joi.string().optional(),
    deskripsi: Joi.string().optional(),
    prioritas: Joi.string().valid("LOW", "MEDIUM", "HIGH").optional(),
    status: Joi.string().valid("TODO", "ON_PROGRESS", "DONE").optional(),
    catatan: Joi.string().allow(null, "").optional(),
    foto: Joi.string().allow(null, "").optional(),
  }),
};

const deleteTask = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
};

export default {
  createTask,
  updateTask,
  deleteTask,
};
