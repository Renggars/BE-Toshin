// src/controllers/rencanaProduksi.controller.js

import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import rencanaProduksiService from "../services/rencanaProduksi.service.js";

const createRencanaProduksi = catchAsync(async (req, res) => {
  const data = await rencanaProduksiService.createRencanaProduksi(req.body);

  res.status(httpStatus.CREATED).json({
    status: true,
    message: "Rencana produksi berhasil dibuat",
    data,
  });
});

const getDashboardSummary = catchAsync(async (req, res) => {
  const summary = await rencanaProduksiService.getDashboardSummary();
  res.send(summary);
});

const getWeeklyTrend = catchAsync(async (req, res) => {
  const trend = await rencanaProduksiService.getWeeklyTrend();
  res.send(trend);
});

const getHistoryRPH = catchAsync(async (req, res) => {
  const { tanggal } = req.query; // Opsional: filter per tanggal
  const history = await rencanaProduksiService.getHistoryRPH(tanggal);
  res.send({ status: true, data: history });
});

const searchOperator = catchAsync(async (req, res) => {
  const { q } = req.query; // Query nama atau UID
  const operator = await rencanaProduksiService.searchOperator(q);
  res.send(operator);
});

export default {
  createRencanaProduksi,
  getDashboardSummary,
  getWeeklyTrend,
  searchOperator,
  getHistoryRPH,
};
