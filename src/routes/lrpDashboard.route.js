import express from "express";
import validate from "../middlewares/validate.js";
import { auth } from "../middlewares/auth.js";
import lrpDashboardValidation from "../validations/lrpDashboard.validation.js";
import lrpDashboardController from "../controllers/lrpDashboard.controller.js";

const router = express.Router();

// Require SUPERVISOR or ADMIN role for dashboard access
// You might also allow ENGINEERING/MAINTENANCE if needed, but per request: SUPERVISOR
const dashboardAuth = auth("SUPERVISOR", "ADMIN", "ENGINEERING");

router.get(
  "/summary",
  dashboardAuth,
  validate(lrpDashboardValidation.getDashboardSummary),
  lrpDashboardController.getDashboardSummary,
);

router.get(
  "/trend-bulanan-harian",
  dashboardAuth,
  validate(lrpDashboardValidation.getTrendBulananHarian),
  lrpDashboardController.getTrendBulananHarian,
);

router.get(
  "/trend-bulanan",
  dashboardAuth,
  validate(lrpDashboardValidation.getTrendBulanan),
  lrpDashboardController.getTrendBulanan,
);

router.get(
  "/ok-vs-ng",
  dashboardAuth,
  validate(lrpDashboardValidation.getOkVsNg),
  lrpDashboardController.getOkVsNg,
);

router.get(
  "/list",
  dashboardAuth,
  validate(lrpDashboardValidation.getLrpList),
  lrpDashboardController.getLrpList,
);

router.get(
  "/export",
  dashboardAuth,
  validate(lrpDashboardValidation.exportData),
  lrpDashboardController.exportData,
);

router.get(
  "/:lrpId",
  dashboardAuth,
  validate(lrpDashboardValidation.getLrpDetail),
  lrpDashboardController.getLrpDetail,
);

router.patch(
  "/:lrpId",
  dashboardAuth,
  validate(lrpDashboardValidation.updateLrp),
  lrpDashboardController.updateLrp,
);

router.delete(
  "/:lrpId",
  dashboardAuth,
  validate(lrpDashboardValidation.deleteLrp),
  lrpDashboardController.deleteLrp,
);

export default router;
