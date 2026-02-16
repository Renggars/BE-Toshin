import Joi from "joi";

const createJenisPekerjaan = {
  body: Joi.object().keys({
    nama_pekerjaan: Joi.string().required(),
  }),
};

const updateJenisPekerjaan = {
  params: Joi.object().keys({
    jenisPekerjaanId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    nama_pekerjaan: Joi.string(),
  }),
};

const getJenisPekerjaan = {
  params: Joi.object().keys({
    jenisPekerjaanId: Joi.number().integer().required(),
  }),
};

const deleteJenisPekerjaan = {
  params: Joi.object().keys({
    jenisPekerjaanId: Joi.number().integer().required(),
  }),
};

export default {
  createJenisPekerjaan,
  updateJenisPekerjaan,
  getJenisPekerjaan,
  deleteJenisPekerjaan,
};
