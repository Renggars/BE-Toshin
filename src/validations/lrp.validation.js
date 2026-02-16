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

      qty_ok: Joi.number().integer().min(0).required(),
      qty_ng_prev: Joi.number().integer().min(0).default(0),
      qty_ng_proses: Joi.number().integer().min(0).default(0),
      qty_rework: Joi.number().integer().min(0).default(0),

      logs: Joi.array()
        .items(
          Joi.object({
            waktu_start: Joi.date().required(),
            waktu_end: Joi.date().greater(Joi.ref("waktu_start")).required(),
            durasi_menit: Joi.number().positive().required(),
            kode_jam_kerja: Joi.string()
              .valid("A", "D", "B1", "B2", "B3", "B4", "C")
              .required(),
            kategori_downtime: Joi.string()
              .valid("PLAN_DOWNTIME", "RUNTIME", "BREAKDOWN")
              .required(),
            keterangan: Joi.string().allow(null, ""),
          }),
        )
        .min(1)
        .required(),
    })
    .custom((value, helpers) => {
      const total =
        value.qty_ok +
        value.qty_ng_prev +
        value.qty_ng_proses +
        value.qty_rework;

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
