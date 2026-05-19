import express from "express";
import announcementController from "../controllers/announcement.controller.js";
import validate from "../middlewares/validate.js";
import announcementValidation from "../validations/announcement.validation.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

router
  .route("/")
  .post(
    auth("MANDOR", "ADMIN"),
    validate(announcementValidation.sendAnnouncement),
    announcementController.sendAnnouncement,
  )
  .get(
    auth("PRODUKSI", "MANDOR", "ADMIN"),
    announcementController.getMyAnnouncements,
  );

router.post(
  "/broadcast",
  auth("MANDOR", "ADMIN"),
  validate(announcementValidation.sendBroadcast),
  announcementController.sendBroadcast,
);

router.get(
  "/sent",
  auth("MANDOR", "ADMIN"),
  announcementController.getSentAnnouncements,
);

router
  .route("/broadcast/:broadcastId")
  .put(
    auth("MANDOR", "ADMIN"),
    validate(announcementValidation.updateBroadcast),
    announcementController.updateBroadcast,
  )
  .delete(
    auth("MANDOR", "ADMIN"),
    validate(announcementValidation.deleteBroadcast),
    announcementController.deleteBroadcast,
  );

router
  .route("/:id")
  .put(
    auth("MANDOR", "ADMIN"),
    validate(announcementValidation.updateAnnouncement),
    announcementController.updateAnnouncement,
  )
  .delete(
    auth("MANDOR", "ADMIN"),
    validate(announcementValidation.deleteAnnouncement),
    announcementController.deleteAnnouncement,
  );

router
  .route("/:id/read")
  .patch(
    auth("PRODUKSI", "ADMIN"),
    validate(announcementValidation.markRead),
    announcementController.markRead,
  );

export default router;
