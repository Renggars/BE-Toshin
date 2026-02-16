import Joi from "joi";

const getDashboardSummary = {
  query: Joi.object().keys({
    tanggal: Joi.string().isoDate(),
    fk_id_mesin: Joi.number().integer(),
    fk_id_shift: Joi.number().integer(),
    plant: Joi.string(),
  }),
};

const getTrendBulananHarian = {
  query: Joi.object().keys({
    fk_id_mesin: Joi.number().integer(),
    fk_id_shift: Joi.number().integer(),
    plant: Joi.string(),
  }),
};

const getTrendBulanan = {
  query: Joi.object().keys({
    year: Joi.number().integer().min(2000).max(2100),
    fk_id_mesin: Joi.number().integer(),
    fk_id_shift: Joi.number().integer(),
    plant: Joi.string(),
  }),
};

const getOkVsNg = {
  query: Joi.object().keys({
    tanggal: Joi.string().isoDate(),
    fk_id_mesin: Joi.number().integer(),
    fk_id_shift: Joi.number().integer(),
    plant: Joi.string(),
  }),
};

const getLrpList = {
  query: Joi.object().keys({
    tanggal: Joi.string()
      .isoDate()
      .description("Format: YYYY-MM-DD")
      .allow(null, ""),

    fk_id_mesin: Joi.number().integer().min(1).allow(null, ""),
    fk_id_shift: Joi.number().integer().min(1).allow(null, ""),
    plant: Joi.string().allow(null, ""),

    limit: Joi.number().integer().min(1).max(100).default(10),
    page: Joi.number().integer().min(1).default(1),

    sortBy: Joi.string().allow(null, ""),
  }),
};

const getLrpDetail = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().required(),
  }),
};

const exportData = {
  query: Joi.object().keys({
    tanggal: Joi.string().isoDate().allow(null, ""),
    fk_id_mesin: Joi.number().integer().allow(null, ""),
    fk_id_shift: Joi.number().integer().allow(null, ""),
    plant: Joi.string().allow(null, ""),
    format: Joi.string().valid("excel", "pdf").default("excel"),
  }),
};

const updateLrp = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      qty_ok: Joi.number().integer().min(0),
      qty_ng_proses: Joi.number().integer().min(0),
      qty_ng_prev: Joi.number().integer().min(0),
      qty_rework: Joi.number().integer().min(0),
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
  getDashboardSummary,
  getTrendBulananHarian,
  getTrendBulanan,
  getOkVsNg,
  getLrpList,
  getLrpDetail,
  exportData,
  updateLrp,
  deleteLrp,
};
