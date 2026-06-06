import express from "express";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import { intelligenceValidation } from "../validations/intelligence.validation.js";
import { intelligenceController } from "../controllers/intelligence.controller.js";

const router = express.Router();

/**
 * @route GET /intelligence/dashboard/:mesinId
 * @desc Mendapatkan data agregat Intelligence (health, cluster, prediction) dari DB cache untuk satu mesin
 * @access Private
 */
router.get(
  "/dashboard",
  auth(), // Membutuhkan autentikasi
  intelligenceController.getAllDashboards
);

/**
 * @route GET /intelligence/dashboard/:mesinId
 * @desc Mendapatkan data agregat Intelligence (health, cluster, prediction) dari DB cache
 * @access Private
 */
router.get(
  "/dashboard/:mesinId",
  auth(), // Membutuhkan autentikasi
  validate(intelligenceValidation.getDashboard),
  intelligenceController.getDashboard
);

/**
 * @route POST /intelligence/refresh-cluster
 * @desc Men-trigger FastAPI untuk mengkalkulasi ulang cluster semua mesin dan menyimpannya di DB cache
 * @access Private
 */
router.post(
  "/refresh-cluster",
  auth(), // Memungkinkan semua pengguna terautentikasi (termasuk Supervisor) untuk me-refresh
  intelligenceController.refreshClusters
);

export default router;
