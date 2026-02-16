import express from "express";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import jenisPekerjaanValidation from "../validations/jenisPekerjaan.validation.js";
import jenisPekerjaanController from "../controllers/jenisPekerjaan.controller.js";

const router = express.Router();

router
  .route("/")
  .get(
    auth("SUPERVISOR", "ADMIN"),
    jenisPekerjaanController.getJenisPekerjaanList,
  )
  .post(
    auth("SUPERVISOR", "ADMIN"),
    validate(jenisPekerjaanValidation.createJenisPekerjaan),
    jenisPekerjaanController.createJenisPekerjaan,
  );

router
  .route("/:jenisPekerjaanId")
  .get(
    auth("SUPERVISOR", "ADMIN"),
    validate(jenisPekerjaanValidation.getJenisPekerjaan),
    jenisPekerjaanController.getJenisPekerjaan,
  )
  .put(
    auth("SUPERVISOR", "ADMIN"),
    validate(jenisPekerjaanValidation.updateJenisPekerjaan),
    jenisPekerjaanController.updateJenisPekerjaan,
  )
  .delete(
    auth("SUPERVISOR", "ADMIN"),
    validate(jenisPekerjaanValidation.deleteJenisPekerjaan),
    jenisPekerjaanController.deleteJenisPekerjaan,
  );

export default router;
