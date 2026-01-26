import express from "express";
import rencanaProduksiController from "../controllers/rencanaProduksi.controller.js";
import { authAdmin } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import rencanaProduksiValidation from "../validations/rencanaProduksi.validation.js";

const router = express.Router();

router.post(
  "/",
  authAdmin(),
  validate(rencanaProduksiValidation.createRencanaProduksi),
  rencanaProduksiController.createRencanaProduksi,
);

export default router;
