import express from "express";
import attendanceController from "../controllers/attendance.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

router.get(
  "/scheduled",
  auth("ADMIN", "SUPERVISOR"),
  attendanceController.getScheduled,
);

router.get(
  "/present",
  auth("ADMIN", "SUPERVISOR"),
  attendanceController.getPresent,
);

router.put(
  "/update",
  auth("ADMIN", "SUPERVISOR"),
  attendanceController.updateAttendance,
);

export default router;
