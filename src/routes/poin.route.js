// src/routes/poin.route.js
import express from "express";
import poinController from "../controllers/poin.controller.js";
import { auth, authAdmin } from "../middlewares/auth.js";

const router = express.Router();

router.get(
  "/dashboard/stats",
  authAdmin(),
  poinController.getPoinDashboardStats,
);
router.get("/dashboard/rankings", authAdmin(), poinController.getPoinRankings);

// Untuk Operator (Cek diri sendiri)
router.get("/my-poin", auth(), poinController.getMyPoin);

// Untuk Supervisor (Input Pelanggaran)
router.post("/pelanggaran", authAdmin(), poinController.postPelanggaran);

router.get("/user/:userId", authAdmin(), poinController.getPoinByUserId);

export default router;
