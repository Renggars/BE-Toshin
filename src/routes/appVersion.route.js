import express from "express";
import appVersionController from "../controllers/appVersion.controller.js";

const router = express.Router();

/**
 * @swagger
 * /app-version:
 *   get:
 *     summary: Get App Version
 *     description: Returns the latest application version information from a static JSON file.
 *     tags: [App Version]
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 android:
 *                   type: object
 *                   properties:
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 *                     buildNumber:
 *                       type: integer
 *                       example: 1
 *                     releaseDate:
 *                       type: string
 *                       example: "2026-03-30"
 *                     downloadUrl:
 *                       type: string
 *                       example: "/app-releases/toshin.apk"
 *                     releaseNotes:
 *                       type: string
 *                       example: "Initial Android release"
 *                     forceUpdate:
 *                       type: boolean
 *                       example: false
 *                     minVersion:
 *                       type: string
 *                       example: "1.0.0"
 *                 windows:
 *                   type: object
 *                   properties:
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 *                     buildNumber:
 *                       type: integer
 *                       example: 1
 *                     releaseDate:
 *                       type: string
 *                       example: "2026-03-30"
 *                     downloadUrl:
 *                       type: string
 *                       example: "/app-releases/toshin-setup.exe"
 *                     releaseNotes:
 *                       type: string
 *                       example: "Initial Windows release"
 *                     forceUpdate:
 *                       type: boolean
 *                       example: false
 *                     minVersion:
 *                       type: string
 *                       example: "1.0.0"
 *       "404":
 *         description: Version file not found
 */
router.get("/", appVersionController.getAppVersion);

export default router;
