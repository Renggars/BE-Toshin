import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import { responseApiSuccess } from "../utils/responseApi.js";
import attendanceService from "../services/attendance.service.js";

const getScheduled = catchAsync(async (req, res) => {
  const result = await attendanceService.getScheduledUsers(req.query);
  responseApiSuccess(res, "Success get scheduled users", result);
});

const getPresent = catchAsync(async (req, res) => {
  const result = await attendanceService.getPresentUsers(req.query);
  responseApiSuccess(res, "Success get present users", result);
});

export default {
  getScheduled,
  getPresent,
};
