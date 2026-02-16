import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import dashboardService from "../services/dashboard.service.js";

const getOEESummary = catchAsync(async (req, res) => {
  const { tanggal, plant } = req.query;
  if (!tanggal) {
    return res.status(httpStatus.BAD_REQUEST).send({
      status: false,
      message: "tanggal query param is required (YYYY-MM-DD)",
    });
  }
  const result = await dashboardService.getOEESummary(tanggal, plant);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getOEETrend = catchAsync(async (req, res) => {
  const { tanggal, shift_ids } = req.query;
  const result = await dashboardService.getOEETrend(tanggal, shift_ids);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getDowntimeHistory = catchAsync(async (req, res) => {
  const { tanggal, plant } = req.query;
  const result = await dashboardService.getDowntimeHistory(tanggal, plant);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getMachineDetail = catchAsync(async (req, res) => {
  const { tanggal, plant } = req.query;
  const result = await dashboardService.getMachineDetail(tanggal, plant);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});
export default {
  getOEESummary,
  getOEETrend,
  getDowntimeHistory,
  getMachineDetail,
};
