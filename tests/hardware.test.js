import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Global Mock Registry ────────────────────────────────────────────────
global.__HARDWARE_MOCKS__ = {
  tcpService: {
    sendCommandToDevice: jest.fn(),
  },
  mockUser: { id: 1, role: "ADMIN", noReg: "REG123" },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          if (!global.__HARDWARE_MOCKS__.isLoggedIn) {
            return res.status(httpStatus.UNAUTHORIZED).json({
              status: false,
              message: "Please authenticate",
            });
          }
          req.user = global.__HARDWARE_MOCKS__.mockUser;
          if (requiredRoles.length && !requiredRoles.includes(req.user.role)) {
            return res.status(httpStatus.FORBIDDEN).json({
              status: false,
              message: "Forbidden",
            });
          }
          next();
        }
    ),
  },
  isLoggedIn: true,
};

// ─── 2. Register ESM Mocks ───────────────────────────────────────────────────
jest.unstable_mockModule("../src/services/tcp.service.js", () => ({
  default: global.__HARDWARE_MOCKS__.tcpService,
}));

jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__HARDWARE_MOCKS__.auth.auth,
}));

// We must mock socket as well since it's used in app.js
jest.unstable_mockModule("../src/config/socket.js", () => ({
  initSocket: jest.fn(),
  getIo: jest.fn(() => ({ to: jest.fn(() => ({ emit: jest.fn() })) })),
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

// Mock redis to prevent connection attempts or top-level logic failures
jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: {
    client: { isOpen: false },
    connectRedis: jest.fn(),
  },
}));

// ─── 3. Dynamic Imports ──────────────────────────────────────────────────────
const { default: app } = await import("../src/app.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────
const setRole = (role) => {
  global.__HARDWARE_MOCKS__.mockUser.role = role;
};
const setLoggedIn = (val) => {
  global.__HARDWARE_MOCKS__.isLoggedIn = val;
};
const resetState = () => {
  global.__HARDWARE_MOCKS__.mockUser.role = "ADMIN";
  global.__HARDWARE_MOCKS__.isLoggedIn = true;
};

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("Hardware Controller Unit Tests", () => {
  const { tcpService } = global.__HARDWARE_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
  });

  describe("POST /hardware/trigger", () => {
    const validPayload = {
      targetId: "TEST-01",
      task: "MTC",
      cmd: "CALL",
    };

    test("✅ should return 200 on successful command delivery", async () => {
      tcpService.sendCommandToDevice.mockReturnValue(true);

      const res = await request(app).post("/hardware/trigger").send(validPayload);

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.message).toContain("Berhasil mengirim perintah");
      expect(tcpService.sendCommandToDevice).toHaveBeenCalledWith("TEST-01", {
        task: "MTC",
        cmd: "CALL",
      });
    });

    test("❌ should return 503 if device is offline (offline scenario)", async () => {
      tcpService.sendCommandToDevice.mockReturnValue(false);

      const res = await request(app).post("/hardware/trigger").send(validPayload);

      expect(res.status).toBe(httpStatus.SERVICE_UNAVAILABLE);
      expect(res.body.message).toContain("sedang offline");
    });

    test("❌ should return 400 if targetId is missing (validation error)", async () => {
      const { targetId, ...invalidPayload } = validPayload;
      const res = await request(app).post("/hardware/trigger").send(invalidPayload);

      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).post("/hardware/trigger").send(validPayload);

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
    });

    test("❌ should return 403 if user role is not allowed (e.g., GA)", async () => {
      setRole("GA");

      const res = await request(app).post("/hardware/trigger").send(validPayload);

      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("✅ should allow PRODUKSI role", async () => {
      setRole("PRODUKSI");
      tcpService.sendCommandToDevice.mockReturnValue(true);

      const res = await request(app).post("/hardware/trigger").send(validPayload);
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should allow MAINTENANCE role", async () => {
      setRole("MAINTENANCE");
      tcpService.sendCommandToDevice.mockReturnValue(true);

      const res = await request(app).post("/hardware/trigger").send(validPayload);
      expect(res.status).toBe(httpStatus.OK);
    });
  });
});
