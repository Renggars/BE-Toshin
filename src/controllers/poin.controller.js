// src/controllers/poin.controller.js
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import poinService from "../services/poin.service.js";

const getMyPoin = catchAsync(async (req, res) => {
  const totalPoin = await poinService.getUserCurrentPoin(req.user.id);
  res.send({ status: true, total_poin: totalPoin });
});

// PASTIKAN FUNGSI INI ADA DAN NAMANYA SAMA PERSIS
const getPoinByUserId = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const totalPoin = await poinService.getUserCurrentPoin(parseInt(userId));
  res.send({ status: true, total_poin: totalPoin });
});

const postPelanggaran = catchAsync(async (req, res) => {
  const result = await poinService.createPelanggaran(req.body, req.user.id);
  res.status(httpStatus.CREATED).send({
    status: true,
    message: "Pelanggaran berhasil dicatat",
    data: result,
  });
});

const getPoinDashboardStats = catchAsync(async (req, res) => {
  const { plant } = req.query;
  const stats = await poinService.getPoinDashboardStats(plant);
  res.send({ status: true, data: stats });
});

const getPoinRankings = catchAsync(async (req, res) => {
  const { plant } = req.query;
  const rankings = await poinService.getPoinRankings(plant);
  res.send({ status: true, data: rankings });
});

export default {
  getMyPoin,
  getPoinByUserId,
  postPelanggaran,
  getPoinDashboardStats,
  getPoinRankings,
};
