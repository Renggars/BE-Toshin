import express from "express";
import client from "prom-client";

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
  res.end(await client.register.metrics());
});

export default router;
