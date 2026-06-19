import express from "express";
import brandingController from "../controllers/branding.controller.js";
import { auth } from "../middlewares/auth.js";
import upload from "../utils/upload.js";

const router = express.Router();

router.get("/background", brandingController.getBackground);
router.post(
  "/background",
  auth("ADMIN"),
  upload.single("background"),
  brandingController.uploadBackground,
);
router.delete("/background", auth("ADMIN"), brandingController.deleteBackground);

export default router;
