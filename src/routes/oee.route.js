import express from "express";
import oeeController from "../controllers/oee.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

// Existing routes
router.get("/mesin/:id", auth("ADMIN", "SUPERVISOR"), oeeController.byMesin);
router.get("/shift/:id", auth("ADMIN", "SUPERVISOR"), oeeController.byShift);
router.get(
  "/shift-mesin/:id",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  oeeController.byMesin,
);
router.get("/plant", auth("ADMIN", "SUPERVISOR"), oeeController.plantSummary);

// New Dashboard routes (accessible via /oee/summary, /oee/trend, etc.)
router.get(
  "/summary",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  oeeController.getOEESummary,
);
router.get(
  "/trend",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  oeeController.getOEETrend,
);
router.get(
  "/history",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  oeeController.getDowntimeHistory,
);
router.get(
  "/machine-detail",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  oeeController.getMachineDetail,
);

export default router;
