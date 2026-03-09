// src/controllers/rencanaProduksi.controller.js

import httpStatus from "http-status";
import moment from "moment";
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
  const { tanggal } = req.query; // Opsional: filter per tanggal, default today di service
  const summary = await rencanaProduksiService.getDashboardSummary(tanggal);
  res.send(summary);
});

const getWeeklyTrend = catchAsync(async (req, res) => {
  const trend = await rencanaProduksiService.getWeeklyTrend();
  res.send(trend);
});

const getHistoryRPH = catchAsync(async (req, res) => {
  const { tanggal } = req.query; // Opsional: filter per tanggal, default today di service
  const history = await rencanaProduksiService.getHistoryRPH(tanggal);
  res.send({ status: true, ...history });
});

const searchOperator = catchAsync(async (req, res) => {
  const { q } = req.query; // Query nama atau UID
  const operator = await rencanaProduksiService.searchOperator(q);
  res.send(operator);
});

const updateRencanaProduksi = catchAsync(async (req, res) => {
  const data = await rencanaProduksiService.updateRencanaProduksi(
    req.params.rphId,
    req.body,
  );
  res.send({
    status: true,
    message: "Rencana produksi berhasil diperbarui",
    data,
  });
});

const deleteRencanaProduksi = catchAsync(async (req, res) => {
  await rencanaProduksiService.deleteRencanaProduksi(req.params.rphId);
  res.send({
    status: true,
    message: "Rencana produksi berhasil dihapus",
  });
});

const getMyRPH = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { tanggal } = req.query; // Opsional: filter per tanggal
  const dateStr = tanggal || moment().format("YYYY-MM-DD");

  const data = await rencanaProduksiService.getUserRPHList(
    parseInt(userId),
    dateStr,
  );

  res.send({
    status: true,
    data,
  });
});

const closeActiveRph = catchAsync(async (req, res) => {
  const { rphId } = req.params;
  const data = await rencanaProduksiService.closeRph(parseInt(rphId));

  res.send({
    status: true,
    message: "RPH berhasil ditutup",
    data,
  });
});

export default {
  createRencanaProduksi,
  getDashboardSummary,
  getWeeklyTrend,
  searchOperator,
  getHistoryRPH,
  updateRencanaProduksi,
  deleteRencanaProduksi,
  getMyRPH,
  closeActiveRph,
};
