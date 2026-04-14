/**
 * export.controller.js
 *
 * Controller untuk menangani endpoint Async Excel Export.
 * Endpoint ini mendelegasikan proses pembentukan file ke BullMQ exportQueue
 * dengan proteksi pencegahan duplikasi *active/waiting* request untuk user yang sama.
 */

import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import ApiError from "../utils/ApiError.js";
import { exportQueue } from "../queues/exportQueue.js";
import lrpDashboardService from "../services/lrpDashboard.service.js"; // Import tambahan
import fs from "fs";                                                 // Import tambahan
import path from "path";                                             // Import tambahan
import { v4 as uuidv4 } from "uuid";                                 // Import tambahan

/**
 * Mendaftarkan pekerjaan export data LRP ke antrean (Queue)
 * POST /lrp-dashboard/export/request
 */
const requestExport = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const filter = {
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    mesinId: req.query.mesinId,
    shiftId: req.query.shiftId,
    plant: req.query.plant,
    jenisPekerjaanId: req.query.jenisPekerjaanId,
    produkId: req.query.produkId,
  };

  // [Fallback Tanpa Redis] Jika exportQueue disabled (null), generate file secara sinkron
  if (!exportQueue) {
    try {
      const buffer = await lrpDashboardService.exportData(filter);
      
      const exportsDir = path.join(process.cwd(), "public", "exports");
      if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
      }
      
      const uid = uuidv4();
      const fileName = `lrp_export_${userId}_${uid}.xlsx`;
      const filePath = path.join(exportsDir, fileName);
      fs.writeFileSync(filePath, buffer);
      
      return res.status(httpStatus.ACCEPTED).json({
        status: "success",
        message: "Request export berhasil secara sinkron.",
        jobId: "sync_" + fileName,
      });
    } catch (err) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Gagal membuat export secara sinkron: " + err.message);
    }
  }

  // 1. Cek apakah user memiliki tugas yang sedang aktif/menunggu untuk Export di Redis
  const activeJobs = await exportQueue.getJobs(["active", "waiting"]);
  const userHasActiveJob = activeJobs.find(
    (job) => job.name === "export-data" && job.data.userId === userId,
  );

  if (userHasActiveJob) {
    return res.status(httpStatus.TOO_MANY_REQUESTS).json({
      status: "error",
      message:
        "Anda memiliki proses export yang sedang berjalan. Mohon tunggu.",
      jobId: userHasActiveJob.id,
    });
  }

  // 2. Tambahkan ke Antrean Export OEE (BullMQ)
  const job = await exportQueue.add("export-data", {
    userId,
    filter,
  });

  res.status(httpStatus.ACCEPTED).json({
    status: "success",
    message: "Request export diterima. Sedang diproses di latar belakang.",
    jobId: job.id,
  });
});

/**
 * Mengecek status job ekspor
 * GET /lrp-dashboard/export/status/:jobId
 */
const getExportStatus = catchAsync(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user.id;

  // [Fallback Tanpa Redis] Jika jobId berawalan 'sync_', file telah selesai digenerate seketika
  if (jobId.startsWith("sync_")) {
    const fileName = jobId.replace("sync_", "");
    const downloadUrl = `/exports/${fileName}`;
    return res.status(httpStatus.OK).json({
      status: "completed",
      message: "Data berhasil diexport.",
      downloadUrl,
    });
  }

  if (!exportQueue) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Job async tidak valid namun redis tidak berjalan.");
  }

  const job = await exportQueue.getJob(jobId);
  if (!job) {
    throw new ApiError(httpStatus.NOT_FOUND, "Job tidak ditemukan.");
  }

  // Auth Guard: memastikan HANYA pemilik request yang bisa melihat/mendownload URL ini
  if (job.data?.userId !== userId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Anda tidak memiliki izin untuk melihat status job ini.",
    );
  }

  // Cek Status Job
  const isFinished = await job.isCompleted();
  const isFailed = await job.isFailed();

  if (isFailed) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: "failed",
      message: "Proses eksport mengalami kegagalan.",
      error: job.failedReason,
    });
  }

  if (!isFinished) {
    return res.status(httpStatus.OK).json({
      status: "processing",
      message: "Data masih sedang diproses.",
    });
  }

  // Jika Selesai, berikan download_url
  // (nilai di-return dari export.worker.js -> job.returnvalue)
  const resultURL = job.returnvalue?.downloadUrl;

  res.status(httpStatus.OK).json({
    status: "completed",
    message: "Data berhasil diexport.",
    downloadUrl: resultURL,
  });
});

export default {
  requestExport,
  getExportStatus,
};
