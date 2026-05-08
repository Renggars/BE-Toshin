import Joi from "joi";

const createTask = {
  body: Joi.object().keys({
    mandorId: Joi.number().integer().required(),
    judul: Joi.string().required(),
    deskripsi: Joi.string().required(),
    prioritas: Joi.string().valid("LOW", "MEDIUM", "HIGH").optional(),
  }),
};

const updateStatus = {
  params: Joi.object().keys({
    id: Joi.number().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().required().valid("TODO", "ON_PROGRESS", "DONE"),
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
