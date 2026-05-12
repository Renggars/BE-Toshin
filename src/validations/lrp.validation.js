import Joi from "joi";

// Schema untuk Upsert LRP (PATCH /lrp/rph/:rphId)
// - Pertama kali: noKanagata & noLot wajib (dicek di service layer)
// - Update berikutnya: semua opsional, minimal 1 field
const upsertLrp = {
  params: Joi.object().keys({
    rphId: Joi.number().integer().required(),
  }),
  body: Joi.object()
    .keys({
      noKanagata:   Joi.string(),
      noLot:        Joi.string(),
      qtyOk:        Joi.number().integer().min(0),
      qtyNgPrev:    Joi.number().integer().min(0),
      qtyNgProses:  Joi.number().integer().min(0),
      qtyRework:    Joi.number().integer().min(0),
      counterStart: Joi.number().integer().min(0).allow(null),
      counterEnd:   Joi.number().integer().min(0).allow(null),
    })
    .min(1),
};

const getLrps = {
  query: Joi.object().keys({
    tanggal:    Joi.date(),
    shiftId:    Joi.number(),
    noKanagata: Joi.string(),
    sortBy:     Joi.string(),
    limit:      Joi.number().integer(),
    page:       Joi.number().integer(),
  }),
};

const getLrp = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().required(),
  }),
};

// Schema untuk "Simpan Final" — butuh lrpId di params, body opsional untuk update terakhir
const submitLrp = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().required(),
  }),
  body: Joi.object().keys({
    noKanagata:   Joi.string(),
    noLot:        Joi.string(),
    qtyOk:        Joi.number().integer().min(0),
    qtyNgPrev:    Joi.number().integer().min(0),
    qtyNgProses:  Joi.number().integer().min(0),
    qtyRework:    Joi.number().integer().min(0),
    counterStart: Joi.number().integer().min(0).allow(null),
    counterEnd:   Joi.number().integer().min(0).allow(null),
  }),
};

const deleteLrp = {
  params: Joi.object().keys({
    lrpId: Joi.number().integer().required(),
  }),
};

const getOperatorProgress = {
  query: Joi.object().keys({
    line: Joi.string(),
    tanggal: Joi.date(),
  }),
};

export default {
  upsertLrp,
  getLrps,
  getLrp,
  submitLrp,
  deleteLrp,
  getOperatorProgress,
};
