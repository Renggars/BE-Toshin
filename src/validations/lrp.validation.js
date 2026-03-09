import Joi from "joi";

const createLrp = {
  body: Joi.object()
    .keys({
      tanggal: Joi.date().required(),
      fk_id_shift: Joi.number().integer().required(),
      fk_id_mesin: Joi.number().integer().required(),
      fk_id_operator: Joi.number().integer().required(),
      fk_id_rph: Joi.number().integer().required(),

      no_kanagata: Joi.string().required(),
      no_lot: Joi.string().required(),
      no_reg: Joi.string().required(),

      qty_ok: Joi.number().integer().min(0).required(),
      qty_ng_prev: Joi.number().integer().min(0).default(0),
      qty_ng_proses: Joi.number().integer().min(0).default(0),
      qty_rework: Joi.number().integer().min(0).default(0),

      counter_start: Joi.number().integer().min(0).allow(null).optional(),
      counter_end: Joi.number().integer().min(0).allow(null).optional(),
    })
    .custom((value, helpers) => {
      const total =
        value.qty_ok +
        (value.qty_ng_prev || 0) +
        (value.qty_ng_proses || 0) +
        (value.qty_rework || 0);

      if (total <= 0) {
        return helpers.error("any.invalid");
      }
      return value;
    }),
};

const getLrps = {
  query: Joi.object().keys({
    tanggal: Joi.date(),
    fk_id_shift: Joi.number(),
    no_kanagata: Joi.string(),
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
      status_lrp: Joi.string().valid("SUBMITTED", "VERIFIED"),
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
