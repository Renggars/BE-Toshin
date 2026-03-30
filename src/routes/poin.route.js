import express from "express";
import poinController from "../controllers/poin.controller.js";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import poinValidation from "../validations/poin.validation.js";
import upload from "../utils/upload.js";

const router = express.Router();

const allRoles = auth("ADMIN", "SUPERVISOR", "PRODUKSI");

// Untuk Supervisor (Input Pelanggaran via NFC atau Manual)
router.post(
  "/",
  auth("SUPERVISOR"),
  upload.single("foto"),
  validate(poinValidation.createPelanggaran),
  poinController.postPelanggaran,
);

// Get form data for dropdown (operators, discipline types, shifts)
router.get("/form-data", auth("SUPERVISOR"), poinController.getFormData);

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

export default router;
