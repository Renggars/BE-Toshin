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

// [STEP 1 & 2] Upsert LRP — buat DRAFT jika belum ada, update jika sudah ada
// Dapat dipanggil kapan saja selama shift (pertama kali, saat istirahat, berkala)
const upsertLrp = catchAsync(async (req, res) => {
  const lrp = await lrpService.upsertLrpByRphId(
    parseInt(req.params.rphId),
    req.body,
  );

  // Emit realtime update ke OEE dashboard agar Mandor bisa pantau progress
  emitOeeUpdate({
    mesinId: lrp.mesinId,
    tanggal: lrp.tanggal,
    shiftId: lrp.shiftId,
  });

  // 201 jika LRP baru dibuat, 200 jika update
  const isNewLrp = !lrp.updatedAt || lrp.updatedAt.getTime() === lrp.createdAt.getTime();
  if (isNewLrp) {
    responseApiCreateSuccess(res, "LRP Draft berhasil dibuat", lrp);
  } else {
    responseApiSuccess(res, "Progres LRP berhasil diperbarui", lrp);
  }
});

const getLrps = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["tanggal", "shiftId", "noKanagata"]);
  const options = pick(req.query, ["sortBy", "limit", "page"]);
  const result = await lrpService.queryLrps(filter, options);
  responseApiSuccess(res, "LRPs retrieved successfully", result);
});

const getLrp = catchAsync(async (req, res) => {
  const lrp = await lrpService.getLrpById(parseInt(req.params.lrpId));
  if (!lrp) {
    throw new ApiError(httpStatus.NOT_FOUND, "LRP not found");
  }
  responseApiSuccess(res, "LRP details retrieved successfully", lrp);
});

// [STEP 3] Simpan Final — finalkan LRP, tutup RPH, cek next_rph
// Menerima body jika ingin update data terakhir sebelum submit
const submitLrp = catchAsync(async (req, res) => {
  const { lrp, next_rph } = await lrpService.submitLrpById(
    parseInt(req.params.lrpId),
    req.body,
  );

  // Emit realtime update ke OEE dashboard
  emitOeeUpdate({
    mesinId: lrp.mesinId,
    tanggal: lrp.tanggal,
    shiftId: lrp.shiftId,
  });

  responseApiSuccess(res, "LRP berhasil disimpan final", { lrp, next_rph });
});

const deleteLrp = catchAsync(async (req, res) => {
  const lrp = await lrpService.deleteLrpById(parseInt(req.params.lrpId));

  // Emit realtime update to OEE dashboard
  emitOeeUpdate({
    mesinId: lrp.mesinId,
    tanggal: lrp.tanggal,
    shiftId: lrp.shiftId,
  });

  responseApiSuccess(res, "LRP deleted successfully");
});

const getOperatorProgress = catchAsync(async (req, res) => {
  const filter = {
    plant: req.user.plant,
    line: req.query.line,
    tanggal: req.query.tanggal,
  };
  const result = await lrpService.getOperatorProgress(filter);
  responseApiSuccess(res, "Operator progress retrieved successfully", result);
});

export default {
  upsertLrp,
  getLrps,
  getLrp,
  submitLrp,
  deleteLrp,
  getOperatorProgress,
};
