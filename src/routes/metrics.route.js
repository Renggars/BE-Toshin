import express from "express";
import client from "prom-client";
import prisma from "../../prisma/index.js";

const router = express.Router();

// Initialize default metrics (CPU, memory, etc.)
client.collectDefaultMetrics();

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Prometheus Metrics
 *     description: Expose application metrics for Prometheus scraping.
 *     tags: [Monitoring]
 *     responses:
 *       "200":
 *         description: Metrics in Prometheus text format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get("/", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  const appMetrics = await client.register.metrics();
  const prismaMetrics = await prisma.$metrics.prometheus();
  res.end(appMetrics + prismaMetrics);
});

export default router;
