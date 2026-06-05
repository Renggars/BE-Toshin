/**
 * oeeQueue.js
 *
 * BullMQ Queue untuk OEE Recalculation.
 */

import { Queue } from "bullmq";
import config from "../config/config.js";
import logger from "../config/logger.js";
import client from "prom-client";

// BullMQ membutuhkan koneksi Redis via ioredis.
const redisConnection = buildRedisConnection(config.redis.url);

function buildRedisConnection(redisUrl) {
  if (!redisUrl) {
    logger.warn("[OEE Queue] REDIS_URL tidak ditemukan, queue tidak akan berjalan.");
    return { host: "localhost", port: 6379 };
  }

  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      username: url.username || "default",
      password: url.password || undefined,
      maxRetriesPerRequest: null,
    };
  } catch {
    logger.warn("[OEE Queue] REDIS_URL tidak valid, menggunakan default localhost:6379");
    return { host: "localhost", port: 6379, maxRetriesPerRequest: null };
  }
}

export const oeeQueue = config.redis.enabled
  ? new Queue("oee-recalc", {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      },
    })
  : null;

// --- Metrics Setup ---
const oeeQueueActive = new client.Gauge({
  name: "oee_queue_active",
  help: "Number of active jobs in oee-recalc queue",
});

export const oeeQueueWaiting = new client.Gauge({
  name: "oee_queue_waiting",
  help: "Number of waiting jobs in oee-recalc queue",
});

// --- Job Performance Metrics ---
export const oeeJobSuccessTotal = new client.Counter({
  name: "oee_job_success_total",
  help: "Total number of successfully processed OEE jobs",
});

export const oeeJobFailedTotal = new client.Counter({
  name: "oee_job_failed_total",
  help: "Total number of failed OEE jobs",
});

export const oeeJobDurationSeconds = new client.Histogram({
  name: "oee_job_duration_seconds",
  help: "Duration of OEE job processing in seconds",
  buckets: [0.5, 1, 3, 5, 10, 20, 30, 60],
});

if (oeeQueue) {
  oeeQueue.on("error", (err) => {
    logger.error("[OEE Queue] Queue error:", err.message);
  });

  setInterval(async () => {
    try {
      const [active, waiting] = await Promise.all([
        oeeQueue.getActiveCount(),
        oeeQueue.getWaitingCount(),
      ]);
      oeeQueueActive.set(active);
      oeeQueueWaiting.set(waiting);
    } catch (err) {
      // Ignore error
    }
  }, 10000);
}

export { redisConnection };
