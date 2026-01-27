import express from "express";
import masterController from "../controllers/master.controller.js";
import validate from "../middlewares/validate.js";
import masterValidation from "../validations/master.validation.js";
import { authAdmin } from "../middlewares/auth.js";

const router = express.Router();
// Endpoint untuk Dropdown
router.get("/mesin", authAdmin(), masterController.getMesin);
router.get("/produk", authAdmin(), masterController.getProduk);
router.get("/shift", authAdmin(), masterController.getShift);
router.get("/target", authAdmin(), masterController.getTarget); // Bisa difilter ?fk_produk=1

// Endpoint untuk Dashboard Admin (Create Master)
router.post(
  "/target",
  validate(masterValidation.createTarget),
  masterController.createTarget,
);

export default router;
