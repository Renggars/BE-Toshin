/**
 * oee.worker.js
 *
 * BullMQ Worker yang memproses job 'oee-recalc' dari oeeQueue.
 * Berjalan di proses yang sama dengan Express (single-process setup),
 * sehingga bisa langsung menggunakan Socket.io instance yang sudah ada.
 *
 * Setiap job berisi: { mesinId, tanggal }
 * Worker akan memanggil recalculateByMesin() yang di dalamnya sudah
 * termasuk emit Socket.io "oee-updated" ke semua client.
 */

import { Worker } from "bullmq";
import config from "../config/config.js";
import oeeService from "../services/oee.service.js";
import logger from "../config/logger.js";
import { redisConnection } from "../queues/oeeQueue.js";

let oeeWorker = null;

export const initOeeWorker = () => {
  if (!config.redis.enabled) {
    logger.info("[OEE Worker] Redis disabled, worker not initialized.");
    return null;
  }
  oeeWorker = new Worker(
    "oee-recalc",
    async (job) => {
      const { mesinId, tanggal } = job.data;

      logger.info(
        `[OEE Worker] Processing job ${job.id} — mesin: ${mesinId}, tanggal: ${tanggal}`,
      );

      await oeeService.recalculateByMesin(mesinId, new Date(tanggal));

      logger.info(
        `[OEE Worker] Job ${job.id} selesai — mesin: ${mesinId}, tanggal: ${tanggal}`,
      );
    },
    {
      connection: redisConnection,
      // Batasi concurrency worker agar tidak membebani MySQL
      // saat banyak job masuk bersamaan (misal: 50 mesin x 3 shift)
      concurrency: 3,
    },
  );

  oeeWorker.on("completed", (job) => {
    logger.info(`[OEE Worker] Job selesai: ${job.id}`);
  });

  oeeWorker.on("failed", (job, err) => {
    logger.error(
      `[OEE Worker] Job gagal: ${job?.id} (attempt ${job?.attemptsMade}) — ${err.message}`,
    );
  });

  oeeWorker.on("error", (err) => {
    logger.error("[OEE Worker] Worker error:", err.message);
  });

  logger.info("[OEE Worker] Worker initialized (concurrency: 3)");

  return oeeWorker;
};

export const closeOeeWorker = async () => {
  if (oeeWorker) {
    await oeeWorker.close();
    logger.info("[OEE Worker] Worker closed.");
  }
};
