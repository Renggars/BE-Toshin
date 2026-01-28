import express from "express";
import oeeController from "../controllers/oee.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

router.get("/mesin/:id", auth(), oeeController.getOEEByMesin);
router.get("/dashboard", auth(), oeeController.getDashboardSummary);

export default router;
