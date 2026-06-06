import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import { intelligenceService } from "../services/intelligence.service.js";

/**
 * Mendapatkan data gabungan Intelligence (Health, Clustering, Prediction) untuk sebuah mesin.
 */
const getDashboard = catchAsync(async (req, res) => {
  const { mesinId } = req.params;
  const dashboardData = await intelligenceService.getIntelligenceDashboard(Number(mesinId));
  
  res.status(httpStatus.OK).send({
    status: true,
    message: "Berhasil mengambil data intelligence dashboard",
    data: dashboardData,
  });
});

/**
 * Mendapatkan data gabungan Intelligence untuk SEMUA mesin.
 */
const getAllDashboards = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    
    const result = await intelligenceService.getAllDashboards(page, limit);
    return res.status(200).json({
      status: true,
      message: "Success retrieving all intelligence dashboards",
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: false,
      message: error.message || "Something went wrong",
    });
  }
};

/**
 * Trigger pembaruan cluster dengan memanggil FastAPI dan meng-update cache DB.
 */
const refreshClusters = catchAsync(async (req, res) => {
  const result = await intelligenceService.refreshClusters();

  res.status(httpStatus.OK).send({
    status: true,
    message: "Berhasil merefresh cluster mesin dari AI Service",
    data: result,
  });
});

export const intelligenceController = {
  getDashboard,
  getAllDashboards,
  refreshClusters,
};
