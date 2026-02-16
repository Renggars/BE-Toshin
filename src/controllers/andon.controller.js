import httpStatus from "http-status";
import andonService from "../services/andon.service.js";
import andonCallService from "../services/andonCall.service.js";
import catchAsync from "../utils/catchAsync.js";
import { responseApiSuccess } from "../utils/responseApi.js";

const triggerAndon = catchAsync(async (req, res) => {
  const result = await andonService.triggerAndon(req.body);
  responseApiSuccess(res, "Success trigger andon", result, httpStatus.CREATED);
});

const callAndon = catchAsync(async (req, res) => {
  const result = await andonCallService.createCall({
    ...req.body,
    fk_id_operator: req.user.id,
  });
  responseApiSuccess(res, "Success call andon", result, httpStatus.CREATED);
});

const startRepairAndon = catchAsync(async (req, res) => {
  const result = await andonService.startRepairAndon(Number(req.params.id), {
    userId: req.user.id,
    fk_id_masalah: req.body.fk_id_masalah,
  });
  responseApiSuccess(res, "Success start repair andon", result);
});

const resolveAndon = catchAsync(async (req, res) => {
  const result = await andonService.resolveAndon(Number(req.params.id), {
    ...req.body,
    resolved_by: req.user.id,
  });
  responseApiSuccess(res, "Success resolve andon", result);
});

const getActive = catchAsync(async (req, res) => {
  const result = await andonService.getActiveEvents();
  responseApiSuccess(res, "Success get active andon", result);
});

const getDashboard = catchAsync(async (req, res) => {
  const result = await andonService.getDashboardData(req.query);
  responseApiSuccess(res, "Success get andon dashboard", result);
});

const getFilters = catchAsync(async (req, res) => {
  const result = await andonService.getAndonFilters();
  responseApiSuccess(res, "Success get andon filters", result);
});

const getTriggerMasterData = catchAsync(async (req, res) => {
  const result = await andonService.getTriggerMasterData();
  responseApiSuccess(res, "Success get trigger master data", result);
});

const getPersonalHistory = catchAsync(async (req, res) => {
  const result = await andonService.getPersonalHistory(req.user.id);
  responseApiSuccess(res, "Success get personal history", result);
});

export default {
  triggerAndon,
  callAndon,
  startRepairAndon,
  resolveAndon,
  getActive,
  getDashboard,
  getFilters,
  getTriggerMasterData,
  getPersonalHistory,
};
