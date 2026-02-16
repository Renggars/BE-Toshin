import express from "express";
import validate from "../middlewares/validate.js";
import produksiValidation from "../validations/produksi.validation.js";
import produksiController from "../controllers/produksi.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

const allRoles = auth("ADMIN", "SUPERVISOR", "PRODUKSI");

router.post(
  "/log",
  allRoles,
  validate(produksiValidation.createLog),
  produksiController.createLog,
);

router.get("/log", auth("SUPERVISOR"), produksiController.getLogs);

export default router;
