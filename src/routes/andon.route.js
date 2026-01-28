import express from "express";
import validate from "../middlewares/validate.js";
import andonValidation from "../validations/andon.validation.js";
import andonController from "../controllers/andon.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

router.post(
  "/trigger",
  validate(andonValidation.triggerAndon),
  andonController.triggerAndon,
);

router.patch(
  "/resolve/:eventId",
  auth(),
  validate(andonValidation.resolveAndon),
  andonController.resolveAndon,
);

router.get("/active", andonController.getActiveEvents);
router.get("/history", andonController.getAndonHistory);

export default router;
