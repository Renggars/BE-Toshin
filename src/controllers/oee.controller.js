import catchAsync from "../utils/catchAsync.js";
import { responseApiSuccess } from "../utils/responseApi.js";
import oeeService from "../services/oee.service.js";

const getOEEByMesin = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { tanggal } = req.query;
  const result = await oeeService.getOEEByMesin(id, tanggal);

  if (!result) {
    // If not found, try to calculate on the fly? Or just return empty stats
    // Let's force calculate for today if empty
    if (!tanggal || new Date(tanggal).getDate() === new Date().getDate()) {
      const calc = await oeeService.calculateOEE(parseInt(id), new Date());
      return responseApiSuccess(res, "Success get OEE stats", calc);
    }
    return responseApiSuccess(res, "OEE Data not found for this date", null);
  }

  responseApiSuccess(res, "Success get OEE stats", result);
});

const getDashboardSummary = catchAsync(async (req, res) => {
  const result = await oeeService.getDashboardSummary();
  responseApiSuccess(res, "Success get OEE dashboard", result);
});

export default {
  getOEEByMesin,
  getDashboardSummary,
};
