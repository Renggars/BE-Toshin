import Joi from "joi";

const createLrp = {
  body: Joi.object()
    .keys({
      tanggal: Joi.date().required(),
      shiftId: Joi.number().integer().required(),
      mesinId: Joi.number().integer().required(),
      operatorId: Joi.number().integer().required(),
      rphId: Joi.number().integer().required(),

      noKanagata: Joi.string().required(),
      noLot: Joi.string().required(),
      noReg: Joi.string().required(),

      qtyOk: Joi.number().integer().min(0).required(),
      qtyNgPrev: Joi.number().integer().min(0).default(0),
      qtyNgProses: Joi.number().integer().min(0).default(0),
      qtyRework: Joi.number().integer().min(0).default(0),

      counterStart: Joi.number().integer().min(0).allow(null).optional(),
      counterEnd: Joi.number().integer().min(0).allow(null).optional(),
    })
    .custom((value, helpers) => {
      const total =
        value.qtyOk +
        (value.qtyNgPrev || 0) +
        (value.qtyNgProses || 0) +
        (value.qtyRework || 0);

      if (total <= 0) {
        return helpers.error("any.invalid");
      }
      return value;
    }),
};

const getLrps = {
  query: Joi.object().keys({
    tanggal: Joi.date(),
    shiftId: Joi.number(),
    noKanagata: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getLrp = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().required(),
  }),
};

const updateLrp = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      statusLrp: Joi.string().valid("SUBMITTED", "VERIFIED"),
    })
    .min(1),
};

const deleteLrp = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().required(),
  }),
};

export default {
  createLrp,
  getLrps,
  getLrp,
  getLrp,
  updateLrp,
  deleteLrp,
};
