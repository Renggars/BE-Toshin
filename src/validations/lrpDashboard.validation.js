import Joi from "joi";

const getDashboardSummary = {
  query: Joi.object().keys({
    startDate: Joi.string().isoDate().allow(null, ""),
    endDate: Joi.string().isoDate().allow(null, ""),
    fk_id_mesin: Joi.number().integer().min(1).allow(null, ""),
    fk_id_shift: Joi.number().integer().min(1).allow(null, ""),
    fk_id_jenis_pekerjaan: Joi.number().integer().min(1).allow(null, ""),
    fk_id_produk: Joi.number().integer().min(1).allow(null, ""),
    plant: Joi.string().allow(null, ""),
  }),
};

// Redundant validations consolidated into getDashboardSummary
// Removing: getTrendBulananHarian, getTrendBulanan, getOkVsNg, getLrpList

const getLrpDetail = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().required(),
  }),
};

const exportData = {
  query: Joi.object().keys({
    startDate: Joi.string().isoDate().allow(null, ""),
    endDate: Joi.string().isoDate().allow(null, ""),
    fk_id_mesin: Joi.number().integer().allow(null, ""),
    fk_id_shift: Joi.number().integer().min(1).allow(null, ""),
    fk_id_jenis_pekerjaan: Joi.number().integer().min(1).allow(null, ""),
    fk_id_produk: Joi.number().integer().min(1).allow(null, ""),
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
  getLrpDetail,
  exportData,
  updateLrp,
  deleteLrp,
};
