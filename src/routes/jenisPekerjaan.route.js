import express from "express";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import jenisPekerjaanValidation from "../validations/jenisPekerjaan.validation.js";
import jenisPekerjaanController from "../controllers/jenisPekerjaan.controller.js";

const router = express.Router();

router
  .route("/")
  .get(
    auth("SUPERVISOR", "ADMIN", "MANDOR"),
    jenisPekerjaanController.getJenisPekerjaanList,
  )
  .post(
    auth("SUPERVISOR", "ADMIN", "MANDOR"),
    validate(jenisPekerjaanValidation.createJenisPekerjaan),
    jenisPekerjaanController.createJenisPekerjaan,
  );

router
  .route("/:jenisPekerjaanId")
  .get(
    auth("SUPERVISOR", "ADMIN", "MANDOR"),
    validate(jenisPekerjaanValidation.getJenisPekerjaan),
    jenisPekerjaanController.getJenisPekerjaan,
  )
  .put(
    auth("SUPERVISOR", "ADMIN", "MANDOR"),
    validate(jenisPekerjaanValidation.updateJenisPekerjaan),
    jenisPekerjaanController.updateJenisPekerjaan,
  )
  .delete(
    auth("SUPERVISOR", "ADMIN", "MANDOR"),
    validate(jenisPekerjaanValidation.deleteJenisPekerjaan),
    jenisPekerjaanController.deleteJenisPekerjaan,
  );

export default router;
