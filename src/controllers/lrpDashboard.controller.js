import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import lrpDashboardService from "../services/lrpDashboard.service.js";
import lrpService from "../services/lrp.service.js";
import { pick } from "../utils/pick.js";

const getDashboardSummary = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    "fk_id_mesin",
    "fk_id_shift",
    "tanggal",
    "plant",
  ]);

  if (!filter.tanggal) {
    filter.tanggal = new Date().toISOString().split("T")[0];
  }

  if (!filter.plant) {
    filter.plant = "3";
  }

  const result = await lrpDashboardService.getDashboardSummary(filter);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getTrendBulananHarian = catchAsync(async (req, res) => {
  const filter = pick(req.query, ["fk_id_mesin", "fk_id_shift", "plant"]);

  if (!filter.plant) {
    filter.plant = "3";
  }

  const result = await lrpDashboardService.getTrendBulananHarian(filter);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getTrendBulanan = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    "year",
    "fk_id_mesin",
    "fk_id_shift",
    "plant",
  ]);

  if (!filter.plant) {
    filter.plant = "3";
  }

  const result = await lrpDashboardService.getTrendBulanan(filter);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getOkVsNg = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    "fk_id_mesin",
    "fk_id_shift",
    "tanggal",
    "plant",
  ]);

  // Default to today if no date provided
  if (!filter.tanggal) {
    filter.tanggal = new Date().toISOString().split("T")[0];
  }

  if (!filter.plant) {
    filter.plant = "3";
  }

  const result = await lrpDashboardService.getOkVsNg(filter);
  res.status(httpStatus.OK).send({
    status: true,
    data: result,
  });
});

const getLrpList = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    "fk_id_mesin",
    "fk_id_shift",
    "tanggal",
    "plant",
  ]);
  const options = pick(req.query, ["limit", "page"]);

  if (!filter.tanggal) {
    filter.tanggal = new Date().toISOString().split("T")[0];
  }

  if (!filter.plant) {
    filter.plant = "3";
  }

  const result = await lrpDashboardService.getLrpList(filter, options);
  res.status(httpStatus.OK).send({
    status: true,
    statusCode: 200,
    message: "Success get LRP list",
    ...result,
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

const exportData = catchAsync(async (req, res) => {
  const filter = pick(req.query, [
    "tanggal",
    "fk_id_mesin",
    "fk_id_shift",
    "plant",
  ]);

  if (!filter.tanggal) {
    filter.tanggal = new Date().toISOString().split("T")[0];
  }

  if (!filter.plant) {
    filter.plant = "3";
  }

  const buffer = await lrpDashboardService.exportData(filter);

  const filename = `LRP_Dashboard_Export_${filter.tanggal}.xlsx`;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

  res.status(httpStatus.OK).send(buffer);
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
  getTrendBulananHarian,
  getTrendBulanan,
  getOkVsNg,
  getLrpList,
  getLrpDetail,
  exportData,
  updateLrp,
  deleteLrp,
};
