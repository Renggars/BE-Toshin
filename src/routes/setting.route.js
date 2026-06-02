// src/routes/setting.route.js
import express from "express";
import { auth } from "../middlewares/auth.js";
import upload from "../utils/upload.js";
import settingController from "../controllers/setting.controller.js";

const router = express.Router();

router.get("/login-background", settingController.getLoginBackground);
router.get("/login-background/image", settingController.getLoginBackgroundImage);

router.patch(
  "/login-background",
  auth("ADMIN"),
  upload.single("image"),
  settingController.updateLoginBackground
);

export default router;
