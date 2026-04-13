import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Global Mock Registry ────────────────────────────────────────────────
global.__HEALTH_MOCKS__ = {
  prisma: {
    $queryRaw: jest.fn(),
  },
  redis: {
    client: {
      isOpen: true,
    },
    connectRedis: jest.fn(),
  },
};

// ─── 2. Register ESM Mocks ───────────────────────────────────────────────────
// Mock auth middleware to prevent initialization errors
jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: jest.fn(() => (req, res, next) => next()),
  authOptional: jest.fn(() => (req, res, next) => next()),
}));

jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: global.__HEALTH_MOCKS__.redis,
}));

jest.unstable_mockModule("../prisma/index.js", () => ({
  default: global.__HEALTH_MOCKS__.prisma,
}));

// Mock socket as well since it's used in app.js
jest.unstable_mockModule("../src/config/socket.js", () => ({
  initSocket: jest.fn(),
  getIo: jest.fn(() => null),
  emitOeeUpdate: jest.fn(),
  emitAndonUpdate: jest.fn(),
  emitAndonDashboardUpdate: jest.fn(),
  emitAndonCreated: jest.fn(),
  emitAndonResolved: jest.fn(),
  emitAndonSummaryUpdated: jest.fn(),
  emitAndonMetricChanged: jest.fn(),
  emitAndonCallCreated: jest.fn(),
  emitAndonRepairStarted: jest.fn(),
  emitNotification: jest.fn(),
}));

// ─── 3. Dynamic Imports ──────────────────────────────────────────────────────
const { default: app } = await import("../src/app.js");

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("Health Controller Unit Tests", () => {
  const { prisma, redis } = global.__HEALTH_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default success state
    prisma.$queryRaw.mockResolvedValue([1]);
    redis.client.isOpen = true;
  });

  test("✅ should return 200 and UP status when both DB and Redis are healthy", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(httpStatus.OK);
    expect(res.body.status).toBe("UP");
    expect(res.body.services.database).toBe("UP");
    expect(res.body.services.redis).toBe("UP");
  });

  test("❌ should return 503 and DOWN status when Database is unhealthy", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("Database disconnected"));

    const res = await request(app).get("/health");

    expect(res.status).toBe(httpStatus.SERVICE_UNAVAILABLE);
    expect(res.body.status).toBe("DOWN");
    expect(res.body.services.database).toBe("DOWN");
    expect(res.body.services.redis).toBe("UP");
  });

  test("❌ should return 503 and DOWN status when Redis is unhealthy", async () => {
    redis.client.isOpen = false;
    redis.connectRedis.mockRejectedValue(new Error("Redis connection failed"));

    const res = await request(app).get("/health");

    expect(res.status).toBe(httpStatus.SERVICE_UNAVAILABLE);
    expect(res.body.status).toBe("DOWN");
    expect(res.body.services.database).toBe("UP");
    expect(res.body.services.redis).toBe("DOWN");
  });

  test("✅ should try to reconnect Redis if it is closed", async () => {
    redis.client.isOpen = false;
    redis.connectRedis.mockResolvedValue();

    const res = await request(app).get("/health");

    expect(res.status).toBe(httpStatus.OK);
    expect(redis.connectRedis).toHaveBeenCalled();
    expect(res.body.services.redis).toBe("UP");
  });

  test("❌ should return 503 when both services are down", async () => {
    prisma.$queryRaw.mockRejectedValue(new Error("DB Down"));
    redis.client.isOpen = false;
    redis.connectRedis.mockRejectedValue(new Error("Redis Down"));

    const res = await request(app).get("/health");

    expect(res.status).toBe(httpStatus.SERVICE_UNAVAILABLE);
    expect(res.body.status).toBe("DOWN");
  });
});
