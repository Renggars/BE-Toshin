import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Mocks ─────────────────────────────────────────────────────────────
// Mock auth middleware to prevent it from loading dependencies that might fail
jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: jest.fn(() => (req, res, next) => next()),
  authOptional: jest.fn(() => (req, res, next) => next()),
}));

// Mock redis to prevent connection attempts or top-level logic failures
jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: {
    client: { isOpen: false },
    connectRedis: jest.fn(),
  },
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

// We don't really need to mock prom-client deeply as we just want to see if the route works
// But it might be already initialized. 

// ─── 2. Dynamic Imports ──────────────────────────────────────────────────────
const { default: app } = await import("../src/app.js");

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("Metrics Route Unit Tests", () => {
  test("✅ should return 200 and prometheus text format", async () => {
    const res = await request(app).get("/metrics");

    expect(res.status).toBe(httpStatus.OK);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    
    // Check for some common default prometheus metrics
    expect(res.text).toContain("nodejs_version_info");
    expect(res.text).toContain("process_cpu_seconds_total");
  });
});
