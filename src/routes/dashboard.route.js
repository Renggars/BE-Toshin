import express from "express";
import dashboardController from "../controllers/dashboard.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

// All routes here are dashboard related and usually require SUPERVISOR or ADMIN role
router.get(
  "/oee/summary",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  dashboardController.getOEESummary,
);
router.get(
  "/oee/trend",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  dashboardController.getOEETrend,
);
router.get(
  "/downtime/history",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  dashboardController.getDowntimeHistory,
);
router.get(
  "/oee/machine-detail",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  dashboardController.getMachineDetail,
);

export default router;
