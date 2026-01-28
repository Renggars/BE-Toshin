import express from "express";
import masterController from "../controllers/master.controller.js";
import validate from "../middlewares/validate.js";
import masterValidation from "../validations/master.validation.js";
import { authAdmin } from "../middlewares/auth.js";

const router = express.Router();

// --- MESIN ---
router.get("/mesin", authAdmin(), masterController.getMesin);
router.post(
  "/mesin",
  authAdmin(),
  validate(masterValidation.createMesin),
  masterController.createMesin,
);
router.patch(
  "/mesin/:id",
  authAdmin(),
  validate(masterValidation.updateMesin),
  masterController.updateMesin,
);
router.delete("/mesin/:id", authAdmin(), masterController.deleteMesin);

// --- PRODUK ---
router.get("/produk", authAdmin(), masterController.getProduk);
router.post(
  "/produk",
  authAdmin(),
  validate(masterValidation.createProduk),
  masterController.createProduk,
);
router.patch(
  "/produk/:id",
  authAdmin(),
  validate(masterValidation.updateProduk),
  masterController.updateProduk,
);
router.delete("/produk/:id", authAdmin(), masterController.deleteProduk);

// --- SHIFT ---
router.get("/shift", authAdmin(), masterController.getShift);
router.post(
  "/shift",
  authAdmin(),
  validate(masterValidation.createShift),
  masterController.createShift,
);
router.patch(
  "/shift/:id",
  authAdmin(),
  validate(masterValidation.updateShift),
  masterController.updateShift,
);
router.delete("/shift/:id", authAdmin(), masterController.deleteShift);

// --- TARGET ---
router.get("/target", authAdmin(), masterController.getTarget);
router.post(
  "/target",
  authAdmin(),
  validate(masterValidation.createTarget),
  masterController.createTarget,
);

// --- MASALAH ANDON ---
// Public read for IoT, restricted write
router.get("/masalah-andon", masterController.getMasalahAndon);
router.post(
  "/masalah-andon",
  authAdmin(),
  validate(masterValidation.createMasalahAndon),
  masterController.createMasalahAndon,
);
router.patch(
  "/masalah-andon/:id",
  authAdmin(),
  validate(masterValidation.updateMasalahAndon),
  masterController.updateMasalahAndon,
);
router.delete(
  "/masalah-andon/:id",
  authAdmin(),
  masterController.deleteMasalahAndon,
);

export default router;
