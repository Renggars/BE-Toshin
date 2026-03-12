import express from "express";
import hardwareController from "../controllers/hardware.controller.js";
import validate from "../middlewares/validate.js";
import hardwareValidation from "../validations/hardware.validation.js";
import { auth } from '../middlewares/auth.js';

const router = express.Router();

router.post("/trigger", auth("PRODUKSI" , "SUPERVISOR", "ADMIN", "MAINTENANCE"),

validate(hardwareValidation.triggerHardware),
hardwareController.triggerHardware);

export default router;
