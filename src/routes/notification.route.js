import express from "express";
import notificationController from "../controllers/notification.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", auth(), notificationController.getNotifications);
router.get("/unread-count", auth(), notificationController.getUnreadCount);
router.patch("/:id/read", auth(), notificationController.markAsRead);

export default router;
