// src/routes/lrp.route.js

import express from "express";
import validate from "../middlewares/validate.js";
import lrpValidation from "../validations/lrp.validation.js";
import lrpController from "../controllers/lrp.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

// ─── UPSERT (Create / Update Progress) ────────────────────────────────────
// PATCH /lrp/rph/:rphId
// Operator memanggil endpoint ini kapan saja selama shift.
// - Pertama kali dipanggil → buat LRP baru dengan statusLrp: DRAFT
// - Dipanggil berikutnya  → update data qty LRP yang sudah ada
// RPH TIDAK ditutup. Mandor bisa pantau progres real-time via dashboard.
router
  .route("/rph/:rphId")
  .patch(
    auth("OPERATOR", "ADMIN"),
    validate(lrpValidation.upsertLrp),
    lrpController.upsertLrp,
  );

// ─── SUBMIT FINAL ──────────────────────────────────────────────────────────
// POST /lrp/:lrpId/submit
// Operator memanggil ini di akhir shift untuk finalisasi LRP.
// - statusLrp → SUBMITTED, RPH → CLOSED
// - Response mengandung next_rph jika ada RPH berikutnya yang PLANNED
// Harus diletakkan SEBELUM /:lrpId agar tidak di-capture sebagai :lrpId = "submit"
router
  .route("/:lrpId/submit")
  .post(
    auth("OPERATOR", "ADMIN"),
    validate(lrpValidation.submitLrp),
    lrpController.submitLrp,
  );

// ─── DASHBOARD MANDOR ──────────────────────────────────────────────────────
router
  .route("/operator-progress")
  .get(
    auth("MANDOR", "SUPERVISOR", "ADMIN"),
    validate(lrpValidation.getOperatorProgress),
    lrpController.getOperatorProgress,
  );

// ─── CRUD STANDAR ──────────────────────────────────────────────────────────
router
  .route("/")
  .get(
    auth(),
    validate(lrpValidation.getLrps),
    lrpController.getLrps,
  );

router
  .route("/:lrpId")
  .get(auth(), validate(lrpValidation.getLrp), lrpController.getLrp)
  .delete(
    auth("SUPERVISOR", "ADMIN"),
    validate(lrpValidation.deleteLrp),
    lrpController.deleteLrp,
  );

export default router;
