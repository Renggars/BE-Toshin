/**
 * exportQueue.js
 *
 * BullMQ Queue untuk menangani Export Excel Asynchronous.
 * Mendukung pembentukan file Buffer yang besar (mengurangi timeout pada client)
 * dan menanganinya secara di background worker, beserta cleanup file local (via TTL Job).
 */

import { Queue } from "bullmq";
import config from "../config/config.js";
import logger from "../config/logger.js";
import { redisConnection } from "./oeeQueue.js"; // Reuse connection yang aman dari oeeQueue

export const exportQueue = config.redis.enabled
  ? new Queue("export-excel", {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: true, // Untuk hemat redis memory. Metadata disimpan per user/file kalau butuh
        removeOnFail: 10, // Simpan beberapa log kalau ekspor gagal
        attempts: 2, // Job ekspor memory-heavy, cukup di-retry max 2x
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
    })
  : null;

if (exportQueue) {
  exportQueue.on("error", (err) => {
    logger.error("[Export Queue] Queue error:", err.message);
  });
}
