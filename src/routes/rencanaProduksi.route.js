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

export default router;
