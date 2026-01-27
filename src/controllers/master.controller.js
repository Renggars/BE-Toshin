import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import masterService from "../services/master.service.js";

const getMesin = catchAsync(async (req, res) => {
  const result = await masterService.getMesin();
  res.send(result);
});

const getProduk = catchAsync(async (req, res) => {
  const result = await masterService.getProduk();
  res.send(result);
});

const getShift = catchAsync(async (req, res) => {
  const result = await masterService.getShift();
  res.send(result);
});

const getTarget = catchAsync(async (req, res) => {
  const filter = {};

  if (req.query.fk_produk) filter.fk_produk = parseInt(req.query.fk_produk);
  if (req.query.fk_jenis_pekerjaan)
    filter.fk_jenis_pekerjaan = parseInt(req.query.fk_jenis_pekerjaan);

  const result = await masterService.getTarget(filter);
  res.send(result);
});

const createTarget = catchAsync(async (req, res) => {
  const result = await masterService.createTarget(req.body);
  res.status(httpStatus.CREATED).send(result);
});

export default { getMesin, getProduk, getShift, getTarget, createTarget };
