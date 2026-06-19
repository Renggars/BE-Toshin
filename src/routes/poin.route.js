import express from "express";
import poinController from "../controllers/poin.controller.js";
import exportController from "../controllers/export.controller.js";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import poinValidation from "../validations/poin.validation.js";
import upload from "../utils/upload.js";

const router = express.Router();

const allRoles = auth("ADMIN", "SUPERVISOR", "OPERATOR", "HR");
const hrRoles = auth("HR");
const hrSupervisorRoles = auth("HR", "SUPERVISOR");

// Untuk Supervisor (Input Pelanggaran via NFC atau Manual)
router.post(
  "/",
  auth("SUPERVISOR"),
  upload.single("foto"),
  validate(poinValidation.createPelanggaran),
  poinController.postPelanggaran,
);
router.post("/reset", auth("ADMIN", "SUPERVISOR"), poinController.resetPoints);

// Get form data for dropdown (operators, discipline types, shifts)
router.get(
  "/form-data",
  auth("SUPERVISOR", "ADMIN"),
  poinController.getFormData,
);

router.get("/dashboard/stats", allRoles, poinController.getPoinDashboardStats);
router.get("/dashboard/weekly-stats", allRoles, poinController.getWeeklyStats);
router.get(
  "/dashboard/monthly-stats",
  allRoles,
  poinController.getMonthlyStats,
);
router.get("/dashboard/rankings", allRoles, poinController.getPoinRankings);

// History endpoint
router.get(
  "/history",
  auth("SUPERVISOR"),
  validate(poinValidation.getHistory),
  poinController.getPoinHistory,
);

// Untuk Operator
router.get("/my-poin", allRoles, poinController.getMyPoin);

router.get("/user/:userId", auth("SUPERVISOR"), poinController.getPoinByUserId);
router.get(
  "/user/by-nfc/:uidNfc",
  auth("SUPERVISOR"),
  poinController.getUserByNfc,
);

// ─── HR ENDPOINTS ──────────────────────────────────────────────────────────────
router.get("/hr/stats", hrRoles, poinController.getHRStats);
router.get("/hr/rankings", hrRoles, poinController.getHRRankings);
router.get("/hr/history", hrRoles, poinController.getHRHistory);
router.patch(
  "/hr/history/:id",
  hrSupervisorRoles,
  validate(poinValidation.updatePoinDisiplin),
  poinController.updatePoinDisiplin,
);
router.get("/hr/export-excel", hrRoles, exportController.exportHRPoinExcel);
router.get("/hr/export-excel/rankings", hrRoles, exportController.exportHRRankingsExcel);

export default router;
