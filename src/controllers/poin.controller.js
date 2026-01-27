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

// PASTIKAN SEMUA SUDAH MASUK KE SINI
export default {
  getMyPoin,
  getPoinByUserId,
  postPelanggaran,
};
