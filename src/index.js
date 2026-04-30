import { initTracing } from "./config/tracing.js";
initTracing();

import prisma from "../prisma/index.js";
import app from "./app.js";
import config from "./config/config.js";
import logger from "./config/logger.js";
import tcpService from "./services/tcp.service.js";

import { initSocket } from "./config/socket.js";
import redis from "./utils/redis.js";
import { initOeeWorker, closeOeeWorker } from "./workers/oee.worker.js";
import {
  initExportWorker,
  closeExportWorker,
} from "./workers/export.worker.js";

let server;

if (prisma) {
  logger.info("Connected to Database");

  // Connect to Redis only if enabled
  if (config.redis.enabled) {
    redis
      .connectRedis()
      .then(() => {
        logger.info("Connected to Redis");

        // Start BullMQ OEE Worker setelah Redis siap
        initOeeWorker();
        initExportWorker();
      })
      .catch((err) => {
        logger.error("Redis connection failed", err);
      });
  } else {
    logger.info("Redis is disabled, skipping connection and workers.");
  }

  server = app.listen(config.port, () => {
    logger.info(`Server is running on http://localhost:${config.port}`);
    console.log(`Docs available at http://localhost:${config.port}/api-docs`);

    // Initialize Socket.io
    initSocket(server);

    //inisialisasi tcp server
    const tcpServer = process.env.TCP_PORT || 4210;
    tcpService.initTcpServer(tcpServer);
  });
}

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info("Server closed");
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error("Unexpected Error", error);
  exitHandler();
};

process.on("uncaughtException", unexpectedErrorHandler);
process.on("unhandledRejection", unexpectedErrorHandler);

process.on("SIGTERM", () => {
  logger.info("SIGTERM received");
  if (server) {
    server.close();
  }
  // Graceful shutdown: tunggu job BullMQ yang sedang berjalan selesai
  closeOeeWorker();
  closeExportWorker();
});

export default app;
