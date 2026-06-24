import { Worker } from "bullmq";
import config from "../config/config.js";
import oeeService from "../services/oee.service.js";
import oeeRphService from "../services/oeeRph.service.js";
import logger from "../config/logger.js";
import {
  redisConnection,
  oeeQueue,
  oeeJobSuccessTotal,
  oeeJobFailedTotal,
  oeeJobDurationSeconds,
} from "../queues/oeeQueue.js";

let oeeWorker = null;

// ── Handler lama: aggregate daily dari oee_rph ───────────────────────────────
const handleOeeRecalc = async (job) => {
  const { mesinId, tanggal } = job.data;
  await oeeService.recalculateByMesin(mesinId, new Date(tanggal));
  logger.info(
    `[OEE Worker] Daily aggregated — mesin: ${mesinId}, tanggal: ${tanggal}`
  );
};

// ── Handler baru: hitung per-RPH → trigger daily ─────────────────────────────
const handleOeeRphRecalc = async (job) => {
  const { rphId } = job.data;

  const oeeRph = await oeeRphService.recalculateByRph(rphId);

  if (!oeeRph) {
    logger.warn(`[OEE Worker] recalculateByRph null — rphId: ${rphId}, skip.`);
    return;
  }

  logger.info(
    `[OEE Worker] RPH recalculated — rphId: ${rphId}, oeeScore: ${oeeRph.oeeScore}`
  );

  // Setelah oee_rph tersimpan, trigger daily aggregate
  // jobId sama untuk mesin+tanggal → BullMQ deduplicate otomatis
  const tanggalStr = oeeRph.tanggal.toISOString().split("T")[0];

  await oeeQueue.add(
    "oee-recalc",
    { mesinId: oeeRph.mesinId, tanggal: tanggalStr },
    {
      jobId:            `oee-${oeeRph.mesinId}-${tanggalStr}`,
      delay:            3000,
      attempts:         3,
      backoff:          { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail:     50,
    }
  );

  logger.info(
    `[OEE Worker] Daily job queued — mesin: ${oeeRph.mesinId}, tanggal: ${tanggalStr}`
  );
};

export const initOeeWorker = () => {
  if (!config.redis.enabled) {
    logger.info("[OEE Worker] Redis disabled, worker not initialized.");
    return null;
  }

  oeeWorker = new Worker(
    "oee-recalc",
    async (job) => {
      const end = oeeJobDurationSeconds.startTimer();

      logger.info(
        `[OEE Worker] Processing job ${job.id} (${job.name}) — data: ${JSON.stringify(job.data)}`
      );

      try {
        // Routing berdasarkan job.name
        if (job.name === "oee-rph-recalc") {
          await handleOeeRphRecalc(job);
        } else {
          // "oee-recalc" — daily aggregate, handler lama
          await handleOeeRecalc(job);
        }

        end();
        oeeJobSuccessTotal.inc();
      } catch (err) {
        end();
        throw err;
      }

      logger.info(
        `[OEE Worker] Job ${job.id} (${job.name}) selesai.`
      );
    },
    {
      connection:  redisConnection,
      concurrency: 3,
    }
  );

  oeeWorker.on("completed", (job) => {
    logger.info(`[OEE Worker] Completed: ${job.id} (${job.name})`);
  });

  oeeWorker.on("failed", (job, err) => {
    oeeJobFailedTotal.inc();
    logger.error(
      `[OEE Worker] Failed: ${job?.id} (${job?.name}) attempt ${job?.attemptsMade} — ${err.message}`
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