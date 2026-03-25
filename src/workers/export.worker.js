/**
 * export.worker.js
 *
 * BullMQ Worker untuk memproses job 'export-data' (generate Excel).
 * Worker akan menulis file `.xlsx` ke dalam `public/exports/` dan mengirim notifikasi
 * Socket.io `export-completed` ke user yang melakukan request dengan tautan untuk diunduh.
 * Lalu mendaftarkan 'cleanup-file' job dengan TTL/Delay untuk menghapus file tersebut.
 */

import { Worker } from "bullmq";
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { fileURLToPath } from "url";
import moment from "moment-timezone";

import config from "../config/config.js";
import lrpDashboardService from "../services/lrpDashboard.service.js";
import logger from "../config/logger.js";
import { exportQueue } from "../queues/exportQueue.js";
import { redisConnection } from "../queues/oeeQueue.js";
import { getIo } from "../config/socket.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORTS_DIR = path.resolve(__dirname, "../../public/exports");

let exportWorker = null;

/**
 * Pastikan folder destinasi `public/exports` selalu ada
 */
const ensureExportsDir = async () => {
  try {
    await fs.mkdir(EXPORTS_DIR, { recursive: true });
  } catch (err) {
    logger.error("[Export Worker] Gagal membuat direktori export", err);
  }
};

export const initExportWorker = async () => {
  if (!config.redis.enabled) {
    logger.info("[Export Worker] Redis disabled, worker not initialized.");
    return null;
  }
  await ensureExportsDir();

  exportWorker = new Worker(
    "export-excel",
    async (job) => {
      // ┌─────────────────────────────────────────────────────────────┐
      // │ 🧹 JOB TIPE 1: CLEANUP FILE (TTL Delay)                     │
      // └─────────────────────────────────────────────────────────────┘
      if (job.name === "cleanup-file") {
        const { filePath } = job.data;
        try {
          // Hanya hapus jika file nyata-nyata ada
          await fs.access(filePath);
          await fs.unlink(filePath);
          logger.info(
            `[Export Worker] Cleanup: file ${path.basename(
              filePath,
            )} telah dihapus`,
          );
        } catch (err) {
          // File mungkin sudah dihapus manual, ignore NOENT
          if (err.code !== "ENOENT") {
            logger.warn(`[Export Worker] Gagal menghapus file: ${err.message}`);
          }
        }
        return { message: "File cleaned up" };
      }

      // ┌─────────────────────────────────────────────────────────────┐
      // │ 📄 JOB TIPE 2: EXPORT DATA                                  │
      // └─────────────────────────────────────────────────────────────┘
      if (job.name === "export-data") {
        const { userId, filter } = job.data;
        logger.info(
          `[Export Worker] Memulai export job ${job.id} untuk user ${userId}`,
        );

        // 1. Dapatkan Excel Buffer dari service (kita memodifikasinya agar return buffer,
        // alih-alih set header via res.send)
        const excelBuffer = await lrpDashboardService.exportData(filter);

        // 2. Tentukan nama letak yang secure (& anti-collision)
        const timestamp = moment().format("YYYYMMDD_HHmmss");
        const randHex = randomBytes(4).toString("hex");
        const filename = `LRP_Export_${userId}_${timestamp}_${randHex}.xlsx`;
        const filePath = path.join(EXPORTS_DIR, filename);

        // 3. Tulis Buffer ke local disk
        await fs.writeFile(filePath, excelBuffer);

        // 4. Bangun URL relative atau absolute untuk dikirim ke frontend
        const downloadUrl = `/exports/${filename}`;
        logger.info(`[Export Worker] File terwujud: ${filename}`);

        // 5. Emit Event Socket ke Room User ({userId}) specific
        try {
          const io = getIo();
          io.to(`user:${userId}`).emit("export-completed", {
            message: "File LRP Dashboard anda siap untuk diunduh",
            jobId: job.id,
            downloadUrl,
            filename,
          });
        } catch (socketErr) {
          logger.warn(
            `[Export Worker] Gagal emit socket 'export-completed' ke user:${userId}`,
            socketErr,
          );
        }

        // 6. Daftarkan Cleanup Job (TTL Delay: 30 menit)
        await exportQueue.add(
          "cleanup-file",
          { filePath },
          { delay: 30 * 60 * 1000, removeOnComplete: true }, // 30 Menit
        );

        return { downloadUrl, filePath };
      }
    },
    {
      connection: redisConnection,
      concurrency: 2, // Export memakan Memory Node.js dan DB yang besar. Concurrency rendah disarankan
    },
  );

  exportWorker.on("completed", (job, returnVal) => {
    logger.info(
      `[Export Worker] Job ${job.name} (id: ${job.id}) selesai dengan sukses`,
    );
  });

  exportWorker.on("failed", (job, err) => {
    logger.error(
      `[Export Worker] Job gagal: ${job?.id} (attempt ${job?.attemptsMade}) — ${err.message}`,
    );
  });

  logger.info("[Export Worker] Worker initialized (concurrency: 2)");
  return exportWorker;
};

export const closeExportWorker = async () => {
  if (exportWorker) {
    await exportWorker.close();
    logger.info("[Export Worker] Worker closed.");
  }
};
