// src/routes/lrp.route.js

import express from "express";
import validate from "../middlewares/validate.js";
import lrpValidation from "../validations/lrp.validation.js";
import lrpController from "../controllers/lrp.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

router
  .route("/")
  .post(
    auth("PRODUKSI", "ADMIN"), // Auth required
    validate(lrpValidation.createLrp),
    lrpController.createLrp,
  )
  .get(
    auth(), // Public to authenticated users?
    validate(lrpValidation.getLrps),
    lrpController.getLrps,
  );

router
  .route("/:lrpId")
  .get(auth(), validate(lrpValidation.getLrp), lrpController.getLrp)
  .patch(
    auth("SUPERVISOR", "ADMIN"), // Edit mostly for Supervisor/QC
    validate(lrpValidation.updateLrp),
    lrpController.updateLrp,
  )
  .delete(
    auth("SUPERVISOR", "ADMIN"),
    validate(lrpValidation.deleteLrp),
    lrpController.deleteLrp,
  );

export default router;
