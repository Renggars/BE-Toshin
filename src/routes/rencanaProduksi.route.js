import express from "express";
import rencanaProduksiController from "../controllers/rencanaProduksi.controller.js";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import rencanaProduksiValidation from "../validations/rencanaProduksi.validation.js";

const router = express.Router();

router.post(
  "/",
  auth("SUPERVISOR"),
  validate(rencanaProduksiValidation.createRencanaProduksi),
  rencanaProduksiController.createRencanaProduksi,
);

router.get(
  "/my-rph",
  auth("SUPERVISOR", "ADMIN", "PRODUKSI"),
  validate(rencanaProduksiValidation.getMyRPH),
  rencanaProduksiController.getMyRPH,
);

router.post(
  "/close-rph/:rphId",
  auth("PRODUKSI", "SUPERVISOR"),
  rencanaProduksiController.closeActiveRph,
);

router.get(
  "/dashboard/summary",
  auth("SUPERVISOR"),
  rencanaProduksiController.getDashboardSummary,
);
router.get(
  "/dashboard/weekly-trend",
  auth("SUPERVISOR"),
  rencanaProduksiController.getWeeklyTrend,
);

router.get(
  "/list",
  auth("SUPERVISOR"),
  rencanaProduksiController.getHistoryRPH,
);

// Endpoint pendukung Form Input RPH
router.get(
  "/search-operator",
  auth("SUPERVISOR"),
  rencanaProduksiController.searchOperator,
);

router.put(
  "/:rphId",
  auth("SUPERVISOR"),
  validate(rencanaProduksiValidation.updateRencanaProduksi),
  rencanaProduksiController.updateRencanaProduksi,
);

router.delete(
  "/:rphId",
  auth("SUPERVISOR"),
  validate(rencanaProduksiValidation.deleteRencanaProduksi),
  rencanaProduksiController.deleteRencanaProduksi,
);

export default router;
