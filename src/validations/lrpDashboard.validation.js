import Joi from "joi";

const getDashboardSummary = {
  query: Joi.object().keys({
    startDate: Joi.string().isoDate().allow(null, ""),
    endDate: Joi.string().isoDate().allow(null, ""),
    mesinId: Joi.number().integer().min(1).allow(null, ""),
    shiftId: Joi.number().integer().min(1).allow(null, ""),
    jenisPekerjaanId: Joi.number().integer().min(1).allow(null, ""),
    produkId: Joi.number().integer().min(1).allow(null, ""),
    plant: Joi.string().allow(null, ""),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).default(10),
  }),
};

const getLrpDetail = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().min(1).required(),
  }),
};

const exportData = {
  query: Joi.object().keys({
    startDate: Joi.string().isoDate().allow(null, ""),
    endDate: Joi.string().isoDate().allow(null, ""),
    mesinId: Joi.number().integer().allow(null, ""),
    shiftId: Joi.number().integer().min(1).allow(null, ""),
    jenisPekerjaanId: Joi.number().integer().min(1).allow(null, ""),
    produkId: Joi.number().integer().min(1).allow(null, ""),
    plant: Joi.string().allow(null, ""),
    format: Joi.string().valid("excel", "pdf").default("excel"),
  }),
};

const updateLrp = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().min(1).required(),
  }),
  body: Joi.object()
    .keys({
      qtyOk: Joi.number().integer().min(0),
      qtyNgProses: Joi.number().integer().min(0),
      qtyNgPrev: Joi.number().integer().min(0),
      qtyRework: Joi.number().integer().min(0),
      statusLrp: Joi.string().valid("SUBMITTED", "VERIFIED"),
    })
    .min(1),
};

const deleteLrp = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().min(1).required(),
  }),
};

export default {
  getDashboardSummary,
  getLrpDetail,
  exportData,
  updateLrp,
  deleteLrp,
};
