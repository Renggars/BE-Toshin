import express from "express";
import healthController from "../controllers/health.controller.js";

const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health Check
 *     description: Check the health status of the API, Database, and Redis.
 *     tags: [Health]
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: UP
 *                 uptime:
 *                   type: number
 *                   example: 123.45
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 services:
 *                   type: object
 *                   properties:
 *                     database:
 *                       type: string
 *                       example: UP
 *                     redis:
 *                       type: string
 *                       example: UP
 *       "503":
 *         description: Service Unavailable
 */
router.get("/", healthController.healthCheck);

export default router;
