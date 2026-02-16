import express from "express";
import andonController from "../controllers/andon.controller.js";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import andonValidation from "../validations/andon.validation.js";

const router = express.Router();

router.post(
  "/trigger",
  auth("PRODUKSI"),
  validate(andonValidation.trigger),
  andonController.triggerAndon,
);

router.post(
  "/call",
  auth("PRODUKSI"),
  validate(andonValidation.call),
  andonController.callAndon,
);

router.patch(
  "/:id/start-repair",
  auth("MAINTENANCE", "ENGINEERING", "DIE_MAINT", "SUPERVISOR", "QUALITY"),
  andonController.startRepairAndon,
);

router.patch(
  "/:id/resolve",
  auth(
    "DIE_MAINT",
    "MAINTENANCE",
    "ENGINEERING",
    "SUPERVISOR",
    "PRODUKSI",
    "QUALITY",
  ),
  andonController.resolveAndon,
);

router.get(
  "/shift",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  andonController.getActive,
);
router.get("/active", auth("ADMIN", "SUPERVISOR"), andonController.getActive);

router.get(
  "/dashboard",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  validate(andonValidation.getDashboard),
  andonController.getDashboard,
);

router.get(
  "/filters",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI"),
  andonController.getFilters,
);

router.get(
  "/trigger-master",
  auth("ADMIN", "SUPERVISOR", "PRODUKSI", "QUALITY"),
  andonController.getTriggerMasterData,
);

router.get(
  "/history",
  auth("PRODUKSI", "SUPERVISOR", "ADMIN"),
  andonController.getPersonalHistory,
);

export default router;
