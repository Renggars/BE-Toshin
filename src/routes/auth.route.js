import express from "express";
import validate from "../middlewares/validate.js";
import authValidation from "../validations/auth.validation.js";
import authController from "../controllers/auth.controller.js";
import { authAdmin } from "../middlewares/auth.js";

const router = express.Router();

router.post(
  "/register",
  // authAdmin(),
  validate(authValidation.register),
  authController.register,
);

router.post("/login", validate(authValidation.login), authController.login);

export default router;
