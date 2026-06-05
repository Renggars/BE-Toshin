import moment from "moment";
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import oeeService from "../services/oee.service.js";
import predictionService from "../services/prediction.service.js";

const byMesin = catchAsync(async (req, res) => {
  res.json(await oeeService.getOEEByMesin(req.params.id));
});

const byShift = catchAsync(async (req, res) => {
  res.json(await oeeService.getOEEByShift(req.params.id));
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

/**
 * Training Data Endpoint
 * GET /oee/training-data?days=90&mesinId=1
 * On-demand, untuk training ML model
 */
const getTrainingData = catchAsync(async (req, res) => {
  const { days = 90, mesinId } = req.query;
  const result = await oeeService.getTrainingData(Number(days), mesinId);
  res.status(httpStatus.OK).send({
    status: true,
    total_records: result.length,
    data: result,
  });
});

/**
 * ML Features Endpoint (dari cache)
 * GET /oee/ml-features?mesinId=1&days=30
 * Untuk prediction endpoint - sangat cepat
 */
const getMLFeatures = catchAsync(async (req, res) => {
  const { mesinId, days = 30 } = req.query;
  if (!mesinId) {
    return res.status(httpStatus.BAD_REQUEST).send({
      status: false,
      message: "mesinId is required",
    });
  }
  const result = await oeeService.getMLFeatures(mesinId, Number(days));
  res.status(httpStatus.OK).send({
    status: true,
    total_records: result.length,
    data: result,
  });
});

/**
 * Prediction Endpoint
 * GET /oee/prediction?mesinId=1&shiftId=2&tanggal=2024-01-15
 * Backend integration dengan HF Prediction Space
 * Menggunakan 3-tier availability check
 */
const getPrediction = catchAsync(async (req, res) => {
  const { mesinId, shiftId, tanggal } = req.query;

  if (!mesinId) {
    return res.status(httpStatus.BAD_REQUEST).send({
      status: false,
      message: "mesinId is required",
    });
  }

  const result = await predictionService.getPrediction(
    mesinId,
    shiftId || null,
    tanggal || moment().format("YYYY-MM-DD"),
  );

  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

/**
 * Prediction Health Check
 * GET /oee/prediction/health
 * Cek apakah HF Prediction Space tersedia
 */
const getPredictionHealth = catchAsync(async (req, res) => {
  const health = await predictionService.checkHealth();
  res.status(httpStatus.OK).send({
    status: true,
    data: health,
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
  getTrainingData,
  getMLFeatures,
  getPrediction,
  getPredictionHealth,
};
