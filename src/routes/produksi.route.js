import express from "express";
import validate from "../middlewares/validate.js";
import produksiValidation from "../validations/produksi.validation.js";
import produksiController from "../controllers/produksi.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

router.post(
  "/log",
  auth(),
  validate(produksiValidation.createLog),
  produksiController.createLog,
);

router.get("/log", auth(), produksiController.getLogs);

export default router;
