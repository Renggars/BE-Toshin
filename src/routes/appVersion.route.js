import express from "express";
import appVersionController from "../controllers/appVersion.controller.js";
import { auth } from "../middlewares/auth.js";
import uploadRelease from "../utils/uploadRelease.js";

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

/**
 * @swagger
 * /app-version/upload/{platform}:
 *   post:
 *     summary: Upload new App Version binary and details
 *     description: Uploads a new .apk or .exe binary and updates the configuration JSON file.
 *     tags: [App Version]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: platform
 *         required: true
 *         schema:
 *           type: string
 *           enum: [android, windows]
 *         description: The targeted OS platform
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The app binary file (.apk or .exe)
 *               version:
 *                 type: string
 *                 description: Application version string (e.g. 1.0.4)
 *               buildNumber:
 *                 type: integer
 *                 description: Monotonically increasing build number
 *               releaseNotes:
 *                 type: string
 *                 description: Changelog or release summary
 *               forceUpdate:
 *                 type: string
 *                 enum: ["true", "false"]
 *                 description: Whether to force update this client version
 *               minVersion:
 *                 type: string
 *                 description: Minimum supported version for clients
 *     responses:
 *       "200":
 *         description: Updated successfully
 *       "400":
 *         description: Bad Request (missing params)
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden (Admin role required)
 */
router.post(
  "/upload/:platform",
  auth("ADMIN"),
  uploadRelease.single("file"),
  appVersionController.uploadAppVersion,
);

export default router;

