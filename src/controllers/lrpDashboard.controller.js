import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import lrpDashboardService from "../services/lrpDashboard.service.js";
import lrpService from "../services/lrp.service.js";
import moment from "moment";
import { pick } from "../utils/pick.js";

const getDashboardSummary = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    "startDate",
    "endDate",
    "mesinId",
    "shiftId",
    "jenisPekerjaanId",
    "produkId",
    "plant",
    "page",
    "limit",
  ]);

  if (!filter.startDate && !filter.endDate) {
    filter.startDate = moment().format("YYYY-MM-DD");
  }

  const result = await lrpDashboardService.getUnifiedDashboardData(filter);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getLrpDetail = catchAsync(async (req, res) => {
  const result = await lrpDashboardService.getLrpDetail(
    Number(req.params.lrpId),
  );
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const updateLrp = catchAsync(async (req, res) => {
  const result = await lrpService.updateLrpById(
    Number(req.params.lrpId),
    req.body,
  );
  res.status(httpStatus.OK).send({
    status: true,
    message: "LRP updated successfully",
    data: result,
  });
});

const deleteLrp = catchAsync(async (req, res) => {
  await lrpService.deleteLrpById(Number(req.params.lrpId));
  res.status(httpStatus.OK).send({
    status: true,
    message: "LRP deleted successfully",
  });
});

export default {
  getDashboardSummary,
  getLrpDetail,
  updateLrp,
  deleteLrp,
};
