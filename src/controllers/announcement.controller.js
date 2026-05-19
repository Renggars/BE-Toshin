import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import { responseApiSuccess } from "../utils/responseApi.js";
import announcementService from "../services/announcement.service.js";

const sendAnnouncement = catchAsync(async (req, res) => {
  const mandorId = req.user.id;
  const result = await announcementService.sendAnnouncement({
    ...req.body,
    mandorId,
  });
  responseApiSuccess(
    res,
    "Success send announcement",
    result,
    httpStatus.CREATED,
  );
});

const sendBroadcast = catchAsync(async (req, res) => {
  const mandorId = req.user.id;
  const result = await announcementService.sendBroadcastAnnouncement({
    ...req.body,
    mandorId,
  });
  responseApiSuccess(
    res,
    "Success broadcast announcement",
    result,
    httpStatus.CREATED,
  );
});

const getMyAnnouncements = catchAsync(async (req, res) => {
  const operatorId = req.user.id;
  const result = await announcementService.getForOperator(operatorId);
  responseApiSuccess(res, "Success get announcements", result);
});

const markRead = catchAsync(async (req, res) => {
  const { id } = req.params;
  await announcementService.markAsRead(parseInt(id));
  responseApiSuccess(res, "Success mark announcement as read", null);
});

const updateAnnouncement = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await announcementService.updateAnnouncement(
    parseInt(id),
    req.body,
  );
  responseApiSuccess(res, "Success update announcement", result);
});

const deleteAnnouncement = catchAsync(async (req, res) => {
  const { id } = req.params;
  await announcementService.deleteAnnouncement(parseInt(id));
  responseApiSuccess(res, "Success delete announcement", null);
});

const updateBroadcast = catchAsync(async (req, res) => {
  const { broadcastId } = req.params;
  const result = await announcementService.updateBroadcast(
    broadcastId,
    req.body,
  );
  responseApiSuccess(res, "Success update broadcast", result);
});

const deleteBroadcast = catchAsync(async (req, res) => {
  const { broadcastId } = req.params;
  await announcementService.deleteBroadcast(broadcastId);
  responseApiSuccess(res, "Success delete broadcast", null);
});

const getSentAnnouncements = catchAsync(async (req, res) => {
  const mandorId = req.user.id;
  const result = await announcementService.getSentByMandor(mandorId);
  responseApiSuccess(res, "Success get sent announcements", result);
});

export default {
  sendAnnouncement,
  sendBroadcast,
  getMyAnnouncements,
  markRead,
  updateAnnouncement,
  deleteAnnouncement,
  updateBroadcast,
  deleteBroadcast,
  getSentAnnouncements,
};
