import catchAsync from "../utils/catchAsync.js";
import notificationService from "../services/notification.service.js";

const getNotifications = catchAsync(async (req, res) => {
    const { page, limit } = req.query;
    const result = await notificationService.getNotifications(req.user.id, {
        page,
        limit,
    });
    res.send({ status: true, ...result });
});

const markAsRead = catchAsync(async (req, res) => {
    await notificationService.markAsRead(req.params.id, req.user.id);
    res.send({ status: true, message: "Notification marked as read" });
});

const getUnreadCount = catchAsync(async (req, res) => {
    const result = await notificationService.getUnreadCount(req.user.id);
    res.send({ status: true, ...result });
});

export default {
    getNotifications,
    markAsRead,
    getUnreadCount,
};