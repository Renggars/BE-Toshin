import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";
import catchAsync from "../utils/catchAsync.js";
import lrpService from "../services/lrp.service.js";
import {
  responseApiSuccess,
  responseApiCreateSuccess,
} from "../utils/responseApi.js";
import { pick } from "../utils/pick.js";
import { emitOeeUpdate } from "../config/socket.js";

const createLrp = catchAsync(async (req, res) => {
  const lrp = await lrpService.createLrp(req.body);

  // Emit realtime update to OEE dashboard
  emitOeeUpdate({
    mesinId: lrp.fk_id_mesin,
    tanggal: lrp.tanggal,
    shiftId: lrp.fk_id_shift,
  });

  responseApiCreateSuccess(res, "LRP created successfully", lrp);
});

const getLrps = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["tanggal", "fk_id_shift", "no_kanagata"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await lrpService.queryLrps(filter, options);
  responseApiSuccess(res, "LRPs retrieved successfully", result);
});

const getLrp = catchAsync(async (req, res) => {
  const lrp = await lrpService.getLrpById(req.params.lrpId);
  if (!lrp) {
    throw new ApiError(httpStatus.NOT_FOUND, "LRP not found");
  }
  responseApiSuccess(res, "LRP details retrieved successfully", lrp);
});

const updateLrp = catchAsync(async (req, res) => {
  const lrp = await lrpService.updateLrpById(req.params.lrpId, req.body);

  // Emit realtime update to OEE dashboard
  emitOeeUpdate({
    mesinId: lrp.fk_id_mesin,
    tanggal: lrp.tanggal,
    shiftId: lrp.fk_id_shift,
  });

  responseApiSuccess(res, "LRP updated successfully", lrp);
});

const deleteLrp = catchAsync(async (req, res) => {
  const lrp = await lrpService.deleteLrpById(req.params.lrpId);

  // Emit realtime update to OEE dashboard
  emitOeeUpdate({
    mesinId: lrp.fk_id_mesin,
    tanggal: lrp.tanggal,
    shiftId: lrp.fk_id_shift,
  });

  responseApiSuccess(res, "LRP deleted successfully");
});

const getDashboardStats = catchAsync(async (req, res) => {
  const stats = await lrpService.getDashboardStats();
  responseApiSuccess(res, "LRP dashboard stats retrieved successfully", stats);
});

export default {
  createLrp,
  getLrps,
  getLrp,
  updateLrp,
  deleteLrp,
  getDashboardStats,
};
