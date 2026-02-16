import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import { responseApiSuccess } from "../utils/responseApi.js";
import masterService from "../services/master.service.js";

// --- Mesin ---
const getMesin = catchAsync(async (req, res) => {
  const result = await masterService.getMesin();
  responseApiSuccess(res, "Success get mesin", result);
});

const createMesin = catchAsync(async (req, res) => {
  const result = await masterService.createMesin(req.body);
  responseApiSuccess(res, "Success create mesin", result, httpStatus.CREATED);
});

const updateMesin = catchAsync(async (req, res) => {
  const result = await masterService.updateMesin(
    parseInt(req.params.id),
    req.body,
  );
  responseApiSuccess(res, "Success update mesin", result);
});

const deleteMesin = catchAsync(async (req, res) => {
  await masterService.deleteMesin(parseInt(req.params.id));
  responseApiSuccess(res, "Success delete mesin", null);
});

// --- Produk ---
const getProduk = catchAsync(async (req, res) => {
  const result = await masterService.getProduk();
  responseApiSuccess(res, "Success get produk", result);
});

const createProduk = catchAsync(async (req, res) => {
  const result = await masterService.createProduk(req.body);
  responseApiSuccess(res, "Success create produk", result, httpStatus.CREATED);
});

const updateProduk = catchAsync(async (req, res) => {
  const result = await masterService.updateProduk(
    parseInt(req.params.id),
    req.body,
  );
  responseApiSuccess(res, "Success update produk", result);
});

const deleteProduk = catchAsync(async (req, res) => {
  await masterService.deleteProduk(parseInt(req.params.id));
  responseApiSuccess(res, "Success delete produk", null);
});

// --- Shift ---
const getShift = catchAsync(async (req, res) => {
  const result = await masterService.getShift();
  responseApiSuccess(res, "Success get shift", result);
});

const createShift = catchAsync(async (req, res) => {
  const result = await masterService.createShift(req.body);
  responseApiSuccess(res, "Success create shift", result, httpStatus.CREATED);
});

const updateShift = catchAsync(async (req, res) => {
  const result = await masterService.updateShift(
    parseInt(req.params.id),
    req.body,
  );
  responseApiSuccess(res, "Success update shift", result);
});

const deleteShift = catchAsync(async (req, res) => {
  await masterService.deleteShift(parseInt(req.params.id));
  responseApiSuccess(res, "Success delete shift", null);
});

// --- Target ---
const getTarget = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.fk_produk) filter.fk_produk = parseInt(req.query.fk_produk);
  if (req.query.fk_jenis_pekerjaan)
    filter.fk_jenis_pekerjaan = parseInt(req.query.fk_jenis_pekerjaan);

  // Ambil ID Shift dari query untuk keperluan kalkulasi
  const shiftId = req.query.fk_id_shift
    ? parseInt(req.query.fk_id_shift)
    : null;

  const result = await masterService.getTarget(filter, shiftId);
  responseApiSuccess(res, "Success get target", result);
});

const createTarget = catchAsync(async (req, res) => {
  const result = await masterService.createTarget(req.body);
  responseApiSuccess(res, "Success create target", result, httpStatus.CREATED);
});

const updateTarget = catchAsync(async (req, res) => {
  const result = await masterService.updateTarget(
    parseInt(req.params.id),
    req.body,
  );
  responseApiSuccess(res, "Success update target", result);
});

const deleteTarget = catchAsync(async (req, res) => {
  await masterService.deleteTarget(parseInt(req.params.id));
  responseApiSuccess(res, "Success delete target", null);
});

// --- Masalah Andon ---
const getMasalahAndon = catchAsync(async (req, res) => {
  const result = await masterService.getMasalahAndon();
  responseApiSuccess(res, "Success get master masalah andon", result);
});

const createMasalahAndon = catchAsync(async (req, res) => {
  const result = await masterService.createMasalahAndon(req.body);
  responseApiSuccess(
    res,
    "Success create masalah andon",
    result,
    httpStatus.CREATED,
  );
});

const updateMasalahAndon = catchAsync(async (req, res) => {
  const result = await masterService.updateMasalahAndon(
    parseInt(req.params.id),
    req.body,
  );
  responseApiSuccess(res, "Success update masalah andon", result);
});

const deleteMasalahAndon = catchAsync(async (req, res) => {
  await masterService.deleteMasalahAndon(parseInt(req.params.id));
  responseApiSuccess(res, "Success delete masalah andon", null);
});

// --- Aggregated Master Data ---
const getAllMasterData = catchAsync(async (req, res) => {
  const result = await masterService.getAllMasterData();
  responseApiSuccess(res, "Success get all master data", result);
});

// --- Tipe Disiplin ---
const getTipeDisiplin = catchAsync(async (req, res) => {
  const result = await masterService.getTipeDisiplin();
  responseApiSuccess(res, "Success get tipe disiplin", result);
});

const createTipeDisiplin = catchAsync(async (req, res) => {
  const result = await masterService.createTipeDisiplin(req.body);
  responseApiSuccess(
    res,
    "Success create tipe disiplin",
    result,
    httpStatus.CREATED,
  );
});

const updateTipeDisiplin = catchAsync(async (req, res) => {
  const result = await masterService.updateTipeDisiplin(
    parseInt(req.params.id),
    req.body,
  );
  responseApiSuccess(res, "Success update tipe disiplin", result);
});

const deleteTipeDisiplin = catchAsync(async (req, res) => {
  await masterService.deleteTipeDisiplin(parseInt(req.params.id));
  responseApiSuccess(res, "Success delete tipe disiplin", null);
});

const getAndonMaster = catchAsync(async (req, res) => {
  const result = await masterService.getAndonMasterData();
  responseApiSuccess(res, "Success get andon master data", result);
});

export default {
  // Mesin
  getMesin,
  createMesin,
  updateMesin,
  deleteMesin,
  // Produk
  getProduk,
  createProduk,
  updateProduk,
  deleteProduk,
  // Shift
  getShift,
  createShift,
  updateShift,
  deleteShift,
  // Target
  getTarget,
  createTarget,
  updateTarget,
  deleteTarget,
  // Andon
  getMasalahAndon,
  createMasalahAndon,
  updateMasalahAndon,
  deleteMasalahAndon,
  // Tipe Disiplin
  getTipeDisiplin,
  createTipeDisiplin,
  updateTipeDisiplin,
  deleteTipeDisiplin,
  // Aggregated
  getAllMasterData,
  getAndonMaster,
};
