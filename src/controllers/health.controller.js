import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import prisma from "../../prisma/index.js";
import redis from "../utils/redis.js";

const healthCheck = catchAsync(async (req, res) => {
  const healthStatus = {
    status: "UP",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      database: "UNKNOWN",
      redis: "UNKNOWN",
    },
  };

  // Check Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    healthStatus.services.database = "UP";
  } catch (error) {
    healthStatus.services.database = "DOWN";
    healthStatus.status = "DOWN";
  }

  // Check Redis
  try {
    if (redis.client.isOpen) {
      healthStatus.services.redis = "UP";
    } else {
      await redis.connectRedis();
      healthStatus.services.redis = "UP";
    }
  } catch (error) {
    healthStatus.services.redis = "DOWN";
    healthStatus.status = "DOWN";
  }

  const statusCode =
    healthStatus.status === "UP"
      ? httpStatus.OK
      : httpStatus.SERVICE_UNAVAILABLE;
  res.status(statusCode).send(healthStatus);
});

export default {
  healthCheck,
};
