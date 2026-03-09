import express from "express";
import validate from "../middlewares/validate.js";
import { auth } from "../middlewares/auth.js";
import lrpDashboardValidation from "../validations/lrpDashboard.validation.js";
import lrpDashboardController from "../controllers/lrpDashboard.controller.js";
import exportController from "../controllers/export.controller.js";

const router = express.Router();

// Require SUPERVISOR or ADMIN role for dashboard access
// You might also allow ENGINEERING/MAINTENANCE if needed, but per request: SUPERVISOR
const dashboardAuth = auth("SUPERVISOR", "ADMIN", "ENGINEERING");

// Consolidated summary endpoint
router.get(
  "/summary",
  dashboardAuth,
  validate(lrpDashboardValidation.getDashboardSummary),
  lrpDashboardController.getDashboardSummary,
);

// Async Export Endpoints
router.post(
  "/export/request",
  dashboardAuth,
  validate(lrpDashboardValidation.exportData),
  exportController.requestExport,
);

router.get(
  "/export/status/:jobId",
  dashboardAuth,
  exportController.getExportStatus,
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
