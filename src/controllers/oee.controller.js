import moment from "moment";
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import oeeService from "../services/oee.service.js";

const byMesin = catchAsync(async (req, res) => {
  res.json(await oeeService.getOEEByMesin(req.params.id));
});

const byShift = catchAsync(async (req, res) => {
  res.json(await oeeService.getOEEByShift(req.params.shiftId));
});

const plantSummary = catchAsync(async (req, res) => {
  res.json(await oeeService.getPlantOEE());
});

/**
 * Dashboard Specific Controllers
 */

const getOEESummary = catchAsync(async (req, res) => {
  const { tanggal = moment().format("YYYY-MM-DD"), plant = "3" } = req.query;
  const result = await oeeService.getOEESummary(tanggal, plant);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getOEETrend = catchAsync(async (req, res) => {
  const {
    tanggal = moment().format("YYYY-MM-DD"),
    shift_ids,
    plant = "3",
  } = req.query;
  const result = await oeeService.getOEETrend(tanggal, shift_ids, plant);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getDowntimeHistory = catchAsync(async (req, res) => {
  const { tanggal = moment().format("YYYY-MM-DD"), plant = "3" } = req.query;
  const result = await oeeService.getDowntimeHistory(tanggal, plant);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getMachineDetail = catchAsync(async (req, res) => {
  const { tanggal = moment().format("YYYY-MM-DD"), plant = "3" } = req.query;
  const result = await oeeService.getMachineDetail(tanggal, plant);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

export default {
  byMesin,
  byShift,
  plantSummary,
  getOEESummary,
  getOEETrend,
  getDowntimeHistory,
  getMachineDetail,
};
