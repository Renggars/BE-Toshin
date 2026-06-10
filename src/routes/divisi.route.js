import express from "express";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import divisiValidation from "../validations/divisi.validation.js";
import divisiController from "../controllers/divisi.controller.js";

const router = express.Router();

router
  .route("/")
  .get(auth("SUPERVISOR", "ADMIN", "HR"), divisiController.getDivisiList)
  .post(
    auth("SUPERVISOR", "ADMIN", "HR"),
    validate(divisiValidation.createDivisi),
    divisiController.createDivisi,
  );

router
  .route("/:divisiId")
  .get(
    auth("SUPERVISOR", "ADMIN", "HR"),
    validate(divisiValidation.getDivisi),
    divisiController.getDivisi,
  )
  .put(
    auth("SUPERVISOR", "ADMIN", "HR"),
    validate(divisiValidation.updateDivisi),
    divisiController.updateDivisi,
  )
  .delete(
    auth("SUPERVISOR", "ADMIN", "HR"),
    validate(divisiValidation.deleteDivisi),
    divisiController.deleteDivisi,
  );

export default router;
