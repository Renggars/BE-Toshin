/**
 * oeeQueue.js
 *
 * BullMQ Queue untuk OEE Recalculation.
 * Memisahkan proses berat recalculateByMesin() dari request thread API
 * agar POST /lrp dan POST /andon/resolve bisa langsung response 201
 * tanpa menunggu kalkulasi OEE selesai.
 *
 * Fitur:
 * - jobId dedup: burst LRP untuk mesin + hari yang sama hanya trigger 1 recalc
 * - delay 3 detik: beri window agar LRP yang masuk bersamaan dikumpulkan dulu
 * - attempts + exponential backoff: retry otomatis jika DB timeout
 * - removeOnFail: simpan 5 job terakhir yang gagal untuk debugging
 */

import { Queue } from "bullmq";
import config from "../config/config.js";
import logger from "../config/logger.js";

// BullMQ membutuhkan koneksi Redis via ioredis (bukan redis v4).
// Kita parse dari REDIS_URL yang sudah ada di .env.
const redisConnection = buildRedisConnection(config.redis.url);

function buildRedisConnection(redisUrl) {
  if (!redisUrl) {
    logger.warn(
      "[OEE Queue] REDIS_URL tidak ditemukan, queue tidak akan berjalan.",
    );
    return { host: "localhost", port: 6379 };
  }

  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      username: url.username || "default",
      password: url.password || undefined,
      // BullMQ menggunakan ioredis, maxRetriesPerRequest harus null
      maxRetriesPerRequest: null,
    };
  } catch {
    logger.warn(
      "[OEE Queue] REDIS_URL tidak valid, menggunakan default localhost:6379",
    );
    return { host: "localhost", port: 6379, maxRetriesPerRequest: null };
  }
}

export const oeeQueue = config.redis.enabled
  ? new Queue("oee-recalc", {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 5, // simpan 5 job terakhir yang gagal untuk debugging
        attempts: 3, // retry otomatis jika gagal (DB timeout, dsb.)
        backoff: {
          type: "exponential",
          delay: 2000, // retry delay: 2s → 4s → 8s
        },
      },
    })
  : null;

if (oeeQueue) {
  oeeQueue.on("error", (err) => {
    logger.error("[OEE Queue] Queue error:", err.message);
  });
}

export { redisConnection };
