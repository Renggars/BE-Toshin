import Joi from "joi";

const getDashboard = {
  params: Joi.object().keys({
    mesinId: Joi.number().integer().required(),
  }),
};

// refreshClusters tidak memiliki payload/parameter khusus saat ini

export const intelligenceValidation = {
  getDashboard,
};
