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
    mesinId: lrp.mesinId,
    tanggal: lrp.tanggal,
    shiftId: lrp.shiftId,
  });

  responseApiCreateSuccess(res, "LRP created successfully", lrp);
});

const getLrps = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["tanggal", "shiftId", "noKanagata"]);
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
    mesinId: lrp.mesinId,
    tanggal: lrp.tanggal,
    shiftId: lrp.shiftId,
  });

  responseApiSuccess(res, "LRP updated successfully", lrp);
});

const deleteLrp = catchAsync(async (req, res) => {
  const lrp = await lrpService.deleteLrpById(req.params.lrpId);

  // Emit realtime update to OEE dashboard
  emitOeeUpdate({
    mesinId: lrp.mesinId,
    tanggal: lrp.tanggal,
    shiftId: lrp.shiftId,
  });

  responseApiSuccess(res, "LRP deleted successfully");
});

export default {
  createLrp,
  getLrps,
  getLrp,
  updateLrp,
  deleteLrp,
};
