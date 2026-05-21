import express from "express";
import mandorTaskController from "../controllers/mandorTask.controller.js";
import validate from "../middlewares/validate.js";
import mandorTaskValidation from "../validations/mandorTask.validation.js";
import { auth } from "../middlewares/auth.js";
import upload from "../utils/upload.js";

const router = express.Router();

router
  .route("/")
  .post(
    auth("SUPERVISOR", "ADMIN"),
    upload.single("foto"),
    validate(mandorTaskValidation.createTask),
    mandorTaskController.createTask,
  )
  .get(
    auth("MANDOR", "SUPERVISOR", "ADMIN"),
    mandorTaskController.getMyTasks,
  );

router
  .route("/:id")
  .patch(
    auth("MANDOR", "SUPERVISOR", "ADMIN"),
    upload.single("foto"),
    validate(mandorTaskValidation.updateStatus),
    mandorTaskController.updateStatus,
  )
  .delete(
    auth("SUPERVISOR", "ADMIN"),
    validate(mandorTaskValidation.deleteTask),
    mandorTaskController.deleteTask,
  );

export default router;
