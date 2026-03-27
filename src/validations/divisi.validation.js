import Joi from "joi";

const createDivisi = {
  body: Joi.object().keys({
    namaDivisi: Joi.string().required(),
  }),
};

const updateDivisi = {
  params: Joi.object().keys({
    divisiId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    namaDivisi: Joi.string(),
  }),
};

const getDivisi = {
  params: Joi.object().keys({
    divisiId: Joi.number().integer().required(),
  }),
};

const deleteDivisi = {
  params: Joi.object().keys({
    divisiId: Joi.number().integer().required(),
  }),
};

export default {
  createDivisi,
  updateDivisi,
  getDivisi,
  deleteDivisi,
};
