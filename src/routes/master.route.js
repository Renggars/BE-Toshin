import express from "express";
import masterController from "../controllers/master.controller.js";
import validate from "../middlewares/validate.js";
import masterValidation from "../validations/master.validation.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

// Role yang diizinkan melihat (Read Only)
const allRoles = auth("ADMIN", "SUPERVISOR", "PRODUKSI");
// Role yang diizinkan mengubah (Write/Edit)
const managerRoles = auth("SUPERVISOR");

// --- Tipe Disiplin ---
router.get("/tipe-disiplin", allRoles, masterController.getTipeDisiplin);
router.post(
  "/tipe-disiplin",
  managerRoles,
  validate(masterValidation.createTipeDisiplin),
  masterController.createTipeDisiplin,
);
router.patch(
  "/tipe-disiplin/:id",
  managerRoles,
  validate(masterValidation.updateTipeDisiplin),
  masterController.updateTipeDisiplin,
);
router.delete(
  "/tipe-disiplin/:id",
  managerRoles,
  masterController.deleteTipeDisiplin,
);

// --- ALL MASTER DATA ---
router.get("/all", managerRoles, masterController.getAllMasterData);

// --- MESIN ---
router.get("/mesin", allRoles, masterController.getMesin);
router.post(
  "/mesin",
  managerRoles,
  validate(masterValidation.createMesin),
  masterController.createMesin,
);
router.patch(
  "/mesin/:id",
  managerRoles,
  validate(masterValidation.updateMesin),
  masterController.updateMesin,
);
router.delete("/mesin/:id", managerRoles, masterController.deleteMesin);

// --- PRODUK ---
router.get("/produk", allRoles, masterController.getProduk);
router.post(
  "/produk",
  managerRoles,
  validate(masterValidation.createProduk),
  masterController.createProduk,
);
router.patch(
  "/produk/:id",
  managerRoles,
  validate(masterValidation.updateProduk),
  masterController.updateProduk,
);
router.delete("/produk/:id", managerRoles, masterController.deleteProduk);

// --- SHIFT ---
router.get("/shift", allRoles, masterController.getShift);
router.post(
  "/shift",
  managerRoles,
  validate(masterValidation.createShift),
  masterController.createShift,
);
router.patch(
  "/shift/:id",
  managerRoles,
  validate(masterValidation.updateShift),
  masterController.updateShift,
);
router.delete("/shift/:id", managerRoles, masterController.deleteShift);

router
  .route("/target")
  .get(allRoles, masterController.getTarget)
  .post(
    managerRoles,
    validate(masterValidation.createTarget),
    masterController.createTarget,
  );

router
  .route("/target/:id")
  .patch(
    managerRoles,
    validate(masterValidation.updateTarget),
    masterController.updateTarget,
  )
  .delete(managerRoles, masterController.deleteTarget);

// --- MASALAH ANDON ---
// Public read for IoT, restricted write
router.get("/masalah-andon", masterController.getMasalahAndon);
router.post(
  "/masalah-andon",
  managerRoles,
  validate(masterValidation.createMasalahAndon),
  masterController.createMasalahAndon,
);
router.patch(
  "/masalah-andon/:id",
  managerRoles,
  validate(masterValidation.updateMasalahAndon),
  masterController.updateMasalahAndon,
);
router.delete(
  "/masalah-andon/:id",
  managerRoles,
  masterController.deleteMasalahAndon,
);

router.get("/andon-master-data", allRoles, masterController.getAndonMaster);

export default router;
