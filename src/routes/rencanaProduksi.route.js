import express from "express";
import rencanaProduksiController from "../controllers/rencanaProduksi.controller.js";
import { authAdmin } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import rencanaProduksiValidation from "../validations/rencanaProduksi.validation.js";

const router = express.Router();

router.post(
  "/",
  authAdmin(),
  validate(rencanaProduksiValidation.createRencanaProduksi),
  rencanaProduksiController.createRencanaProduksi,
);

router.get(
  "/dashboard/summary",
  authAdmin(),
  rencanaProduksiController.getDashboardSummary,
);
router.get(
  "/dashboard/weekly-trend",
  authAdmin(),
  rencanaProduksiController.getWeeklyTrend,
);

router.get("/list", authAdmin(), rencanaProduksiController.getHistoryRPH);

// Endpoint pendukung Form Input RPH
router.get(
  "/search-operator",
  authAdmin(),
  rencanaProduksiController.searchOperator,
);

export default router;
