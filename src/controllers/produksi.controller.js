import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import { responseApiSuccess } from "../utils/responseApi.js";
import produksiService from "../services/produksi.service.js";

const createLog = catchAsync(async (req, res) => {
  const result = await produksiService.createProduksiLog(req.body);
  responseApiSuccess(
    res,
    "Production log created successfully",
    result,
    httpStatus.CREATED,
  );
});

const getLogs = catchAsync(async (req, res) => {
  const result = await produksiService.getProduksiLogs(req.query);
  responseApiSuccess(res, "Success get production logs", result);
});

export default {
  createLog,
  getLogs,
};
