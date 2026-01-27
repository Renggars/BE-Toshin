// src/routes/poin.route.js
import express from "express";
import poinController from "../controllers/poin.controller.js";
import { auth, authAdmin } from "../middlewares/auth.js";

const router = express.Router();

// Untuk Operator (Cek diri sendiri)
router.get("/my-poin", auth(), poinController.getMyPoin);

// Untuk Supervisor (Cek orang lain saat Create RPH atau Dashboard)
router.get("/user/:userId", authAdmin(), poinController.getPoinByUserId);

// Untuk Supervisor (Input Pelanggaran)
router.post("/pelanggaran", authAdmin(), poinController.postPelanggaran);

export default router;
