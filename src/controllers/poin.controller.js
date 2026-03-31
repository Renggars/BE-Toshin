// src/controllers/poin.controller.js
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import poinService from "../services/poin.service.js";

const getMyPoin = catchAsync(async (req, res) => {
  const totalPoin = await poinService.getUserCurrentPoin(req.user.id);
  res.send({ status: true, totalPoin: totalPoin });
});

// PASTIKAN FUNGSI INI ADA DAN NAMANYA SAMA PERSIS
const getPoinByUserId = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const totalPoin = await poinService.getUserCurrentPoin(parseInt(userId));
  res.send({ status: true, totalPoin: totalPoin });
});

const postPelanggaran = catchAsync(async (req, res) => {
  const result = await poinService.createPelanggaran(
    req.body,
    req.user.id,
    req.file,
  );
  res.status(httpStatus.CREATED).send({
    status: true,
    message: "Pelanggaran berhasil dicatat",
    operator: {
      id: result.operatorId,
      nama: result.operator?.nama || "Operator",
      currentPoint: await poinService.getUserCurrentPoin(
        result.operatorId,
      ),
    },
    data: result,
  });
});

const getPoinDashboardStats = catchAsync(async (req, res) => {
  const { plant, tanggal } = req.query;
  const stats = await poinService.getPoinDashboardStats(plant, tanggal);
  res.send({ status: true, data: stats });
});

const getPoinRankings = catchAsync(async (req, res) => {
  const { plant } = req.query;
  const rankings = await poinService.getPoinRankings(plant);
  res.send({ status: true, data: rankings });
});

const getPoinHistory = catchAsync(async (req, res) => {
  const filter = {
    plant: req.query.plant,
    tanggal: req.query.tanggal,
  };
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 10,
  };

  const result = await poinService.getPoinHistory(filter, options);

  res.send({
    status: true,
    ...result,
  });
});

const getFormData = catchAsync(async (req, res) => {
  const result = await poinService.getFormData();
  res.send({
    status: true,
    data: result,
  });
});

const getWeeklyStats = catchAsync(async (req, res) => {
  const { plant } = req.query;
  const stats = await poinService.getWeeklyStats(plant);
  res.send({ status: true, ...stats });
});

const getMonthlyStats = catchAsync(async (req, res) => {
  const { plant } = req.query;
  const stats = await poinService.getMonthlyStats(plant);
  res.send({ status: true, ...stats });
});

const getUserByNfc = catchAsync(async (req, res) => {
  const { uidNfc } = req.params;
  const user = await poinService.getUserByNfc(uidNfc);
  res.send({ status: true, data: user });
});

const resetPoints = catchAsync(async (req, res) => {
  await poinService.resetAllUsersPoints();
  res.send({ status: true, message: "Poin semua user berhasil direset ke 100" });
});

export default {
  getFormData,
  getMyPoin,
  getPoinByUserId,
  postPelanggaran,
  getPoinDashboardStats,
  getPoinRankings,
  getPoinHistory,
  getWeeklyStats,
  getMonthlyStats,
  getUserByNfc,
  resetPoints,
};
