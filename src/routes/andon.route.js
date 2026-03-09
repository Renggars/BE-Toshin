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
  auth("MAINTENANCE", "DIE_MAINT", "SUPERVISOR", "QUALITY", "PRODUKSI"),
  andonController.startRepairAndon,
);

router.patch(
  "/:id/resolve",
  auth("DIE_MAINT", "MAINTENANCE", "SUPERVISOR", "PRODUKSI", "QUALITY"),
  andonController.resolveAndon,
);

router.get(
  "/active",
  auth("ADMIN", "SUPERVISOR", "MAINTENANCE", "QUALITY", "DIE_MAINT"),
  validate(andonValidation.getActive),
  andonController.getActive,
);

router.get(
  "/my-active",
  auth(
    "ADMIN",
    "SUPERVISOR",
    "PRODUKSI",
    "QUALITY",
    "DIE_MAINT",
    "MAINTENANCE",
  ),
  validate(andonValidation.getActive),
  andonController.getMyActive,
);

router.get(
  "/dashboard",
  auth(
    "ADMIN",
    "SUPERVISOR",
    "PRODUKSI",
    "QUALITY",
    "DIE_MAINT",
    "MAINTENANCE",
  ),
  validate(andonValidation.getDashboard),
  andonController.getDashboard,
);

router.get(
  "/filters",
  auth(
    "ADMIN",
    "SUPERVISOR",
    "PRODUKSI",
    "QUALITY",
    "DIE_MAINT",
    "MAINTENANCE",
  ),
  andonController.getFilters,
);

router.get(
  "/trigger-master",
  auth(
    "ADMIN",
    "SUPERVISOR",
    "PRODUKSI",
    "QUALITY",
    "DIE_MAINT",
    "MAINTENANCE",
  ),
  andonController.getTriggerMasterData,
);

router.get(
  "/history",
  auth(
    "PRODUKSI",
    "SUPERVISOR",
    "ADMIN",
    "QUALITY",
    "DIE_MAINT",
    "MAINTENANCE",
  ),
  andonController.getPersonalHistory,
);

export default router;
