import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import { responseApiSuccess } from "../utils/responseApi.js";
import andonService from "../services/andon.service.js";

const triggerAndon = catchAsync(async (req, res) => {
  const result = await andonService.triggerAndon(req.body);
  responseApiSuccess(
    res,
    "Andon triggered successfully",
    result,
    httpStatus.CREATED,
  );
});

const resolveAndon = catchAsync(async (req, res) => {
  // Ambil user ID dari token (resolver)
  const resolved_by = req.user.id;
  const { eventId } = req.params;

  const result = await andonService.resolveAndon(parseInt(eventId), {
    resolved_by,
    ...req.body,
  });

  responseApiSuccess(res, "Andon resolved successfully", result);
});

const getActiveEvents = catchAsync(async (req, res) => {
  const result = await andonService.getActiveEvents();
  responseApiSuccess(res, "Success get active andon events", result);
});

const getAndonHistory = catchAsync(async (req, res) => {
  const result = await andonService.getAndonHistory(req.query);
  responseApiSuccess(res, "Success get andon history", result);
});

export default {
  triggerAndon,
  resolveAndon,
  getActiveEvents,
  getAndonHistory,
};
