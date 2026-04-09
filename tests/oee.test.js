import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Global Mock Registry ─────────────────────────────────────────────────
global.__OEE_MOCKS__ = {
  oeeService: {
    getOEEByMesin: jest.fn(),
    getOEEByShift: jest.fn(),
    getPlantOEE: jest.fn(),
    getOEESummary: jest.fn(),
    getOEETrend: jest.fn(),
    getDowntimeHistory: jest.fn(),
    getMachineDetail: jest.fn(),
    recalculateByMesin: jest.fn(),
  },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          if (!global.__OEE_MOCKS__.isLoggedIn) {
            return res.status(httpStatus.UNAUTHORIZED).json({
              status: false,
              message: "Please authenticate",
            });
          }
          req.user = global.__OEE_MOCKS__.mockUser;
          if (requiredRoles.length && !requiredRoles.includes(req.user.role)) {
            return res.status(httpStatus.FORBIDDEN).json({
              status: false,
              message: "Forbidden: You do not have the required role",
            });
          }
          next();
        }
    ),
  },
  mockUser: { id: 1, role: "ADMIN", email: "admin@test.com" },
  isLoggedIn: true,
};

// ─── 2. ESM Mocks ─────────────────────────────────────────────────────────────
jest.unstable_mockModule("../src/services/oee.service.js", () => ({
  default: global.__OEE_MOCKS__.oeeService,
}));

jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__OEE_MOCKS__.auth.auth,
}));

jest.unstable_mockModule("../src/config/socket.js", () => ({
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
  initSocket: jest.fn(),
  getIo: jest.fn(() => null),
}));

jest.unstable_mockModule("../src/queues/exportQueue.js", () => ({
  exportQueue: { getJobs: jest.fn(), add: jest.fn(), getJob: jest.fn() },
}));

jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: { get: jest.fn(), set: jest.fn(), delByPattern: jest.fn() },
}));

// ─── 3. Dynamic Imports ────────────────────────────────────────────────────────
const { default: app } = await import("../src/app.js");
const { default: ApiError } = await import("../src/utils/ApiError.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────
const setRole = (role) => { global.__OEE_MOCKS__.mockUser.role = role; };
const setLoggedIn = (val) => { global.__OEE_MOCKS__.isLoggedIn = val; };
const resetState = () => {
  global.__OEE_MOCKS__.mockUser = { id: 1, role: "ADMIN", email: "admin@test.com" };
  global.__OEE_MOCKS__.isLoggedIn = true;
};

// ─── Fixtures ──────────────────────────────────────────────────────────────────
const mockOeeList = [
  {
    id: 1,
    mesinId: 10,
    shiftId: 1,
    tanggal: "2025-01-15T00:00:00.000Z",
    availability: 92.5,
    performance: 88.0,
    quality: 99.0,
    oeeScore: 80.3,
    loadingTime: 450,
    downtime: 30,
    totalOutput: 500,
    totalOk: 495,
    idealCycleTime: 0.9,
  },
  {
    id: 2,
    mesinId: 10,
    shiftId: 2,
    tanggal: "2025-01-15T00:00:00.000Z",
    availability: 85.0,
    performance: 90.0,
    quality: 97.5,
    oeeScore: 74.6,
    loadingTime: 420,
    downtime: 60,
    totalOutput: 480,
    totalOk: 468,
    idealCycleTime: 0.9,
  },
];

const mockOeeSummary = {
  availability: 90.1,
  performance: 88.5,
  quality: 98.2,
  oee: 78.4,
  status: "GOOD",
};

const mockOeeSummaryNoData = {
  availability: 0,
  performance: 0,
  quality: 0,
  oee: 0,
  status: "NO_DATA",
};

const mockOeeTrend = {
  labels: ["06", "07", "08", "09", "10", "11", "12", "13", "14", "15"],
  shift1: [80.0, 82.0, 81.5, 79.0, 83.0, 85.0, 84.0, 86.0, 80.5, 78.4],
  shift2: [75.0, 77.0, 78.5, 76.0, 79.0, 80.0, 81.0, 82.0, 75.5, 74.6],
  shift3: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

const mockDowntimeHistory = [
  { label: "Kerusakan Mesin", hours: 3.5 },
  { label: "Pergantian Dies", hours: 2.0 },
  { label: "Setup", hours: 1.5 },
];

const mockMachineDetail = [
  {
    machineName: "Mesin 10",
    shifts: {
      shift1: { ok: 495, ng: 5, downtime: 30, target: 500 },
      shift2: { ok: 468, ng: 12, downtime: 60, target: 500 },
      shift3: { ok: 0, ng: 0, downtime: 0, target: 0 },
    },
    summary: {
      availability: 90.1,
      performance: 88.5,
      quality: 98.2,
      oee: 78.4,
    },
  },
];

const mockPlantOee = {
  _avg: {
    availability: 89.5,
    performance: 87.2,
    quality: 98.0,
    oeeScore: 76.8,
  },
};

// ─── Test Suite ────────────────────────────────────────────────────────────────
describe("OEE Controller - Comprehensive Unit Tests", () => {
  const { oeeService } = global.__OEE_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
  });

  // ===========================================================================
  // GET /oee/mesin/:id
  // ===========================================================================
  describe("GET /oee/mesin/:id", () => {

    // ── Success Cases ─────────────────────────────────────────────────────
    test("✅ should return 200 with OEE list for valid mesinId", async () => {
      oeeService.getOEEByMesin.mockResolvedValue(mockOeeList);

      const res = await request(app).get("/oee/mesin/10");

      expect(res.status).toBe(httpStatus.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(oeeService.getOEEByMesin).toHaveBeenCalledWith("10");
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      oeeService.getOEEByMesin.mockResolvedValue(mockOeeList);

      const res = await request(app).get("/oee/mesin/10");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return empty array when no OEE records exist for machine", async () => {
      oeeService.getOEEByMesin.mockResolvedValue([]);

      const res = await request(app).get("/oee/mesin/999");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body).toHaveLength(0);
    });

    test("✅ should return OEE list with correct fields", async () => {
      oeeService.getOEEByMesin.mockResolvedValue([mockOeeList[0]]);

      const res = await request(app).get("/oee/mesin/10");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body[0]).toMatchObject({
        mesinId: 10,
        availability: expect.any(Number),
        performance: expect.any(Number),
        quality: expect.any(Number),
        oeeScore: expect.any(Number),
      });
    });

    // ── Authorization Cases ───────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/oee/mesin/10");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(oeeService.getOEEByMesin).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");

      const res = await request(app).get("/oee/mesin/10");

      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(oeeService.getOEEByMesin).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/oee/mesin/10");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/oee/mesin/10");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Error Cases ───────────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      oeeService.getOEEByMesin.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).get("/oee/mesin/10");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection error (P1001)", async () => {
      oeeService.getOEEByMesin.mockRejectedValue(
        Object.assign(new Error("Can't reach database server"), { code: "P1001" })
      );

      const res = await request(app).get("/oee/mesin/10");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma query timeout (P1008)", async () => {
      oeeService.getOEEByMesin.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );

      const res = await request(app).get("/oee/mesin/10");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /oee/shift/:id
  // ===========================================================================
  describe("GET /oee/shift/:id", () => {

    // ── Success Cases ─────────────────────────────────────────────────────
    test("✅ should return 200 with OEE list for valid shiftId", async () => {
      oeeService.getOEEByShift.mockResolvedValue([mockOeeList[0]]);

      const res = await request(app).get("/oee/shift/1");

      expect(res.status).toBe(httpStatus.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(oeeService.getOEEByShift).toHaveBeenCalledWith("1");
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      oeeService.getOEEByShift.mockResolvedValue([mockOeeList[0]]);

      const res = await request(app).get("/oee/shift/1");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return empty array when no OEE records for that shift", async () => {
      oeeService.getOEEByShift.mockResolvedValue([]);

      const res = await request(app).get("/oee/shift/999");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body).toHaveLength(0);
    });

    test("✅ should return multiple OEE records from different machines for a shift", async () => {
      const multiMachineCombined = [
        ...mockOeeList,
        { ...mockOeeList[0], id: 3, mesinId: 20 },
      ];
      oeeService.getOEEByShift.mockResolvedValue(multiMachineCombined);

      const res = await request(app).get("/oee/shift/1");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body).toHaveLength(3);
    });

    // ── Authorization Cases ───────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/oee/shift/1");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(oeeService.getOEEByShift).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get("/oee/shift/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/oee/shift/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Error Cases ───────────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      oeeService.getOEEByShift.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).get("/oee/shift/1");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma pool exhausted (P2037)", async () => {
      oeeService.getOEEByShift.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );

      const res = await request(app).get("/oee/shift/1");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /oee/shift-mesin/:id  (same controller as byMesin, different roles)
  // ===========================================================================
  describe("GET /oee/shift-mesin/:id", () => {

    // ── Success Cases ─────────────────────────────────────────────────────
    test("✅ should return 200 with ADMIN role", async () => {
      oeeService.getOEEByMesin.mockResolvedValue(mockOeeList);

      const res = await request(app).get("/oee/shift-mesin/10");

      expect(res.status).toBe(httpStatus.OK);
      expect(oeeService.getOEEByMesin).toHaveBeenCalledWith("10");
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      oeeService.getOEEByMesin.mockResolvedValue(mockOeeList);

      const res = await request(app).get("/oee/shift-mesin/10");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with PRODUKSI role", async () => {
      setRole("PRODUKSI");
      oeeService.getOEEByMesin.mockResolvedValue(mockOeeList);

      const res = await request(app).get("/oee/shift-mesin/10");

      expect(res.status).toBe(httpStatus.OK);
    });

    // ── Authorization Cases ───────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);
      const res = await request(app).get("/oee/shift-mesin/10");
      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/oee/shift-mesin/10");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/oee/shift-mesin/10");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Error Cases ───────────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      oeeService.getOEEByMesin.mockRejectedValue(new Error("Service failure"));
      const res = await request(app).get("/oee/shift-mesin/10");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /oee/plant
  // ===========================================================================
  describe("GET /oee/plant", () => {

    // ── Success Cases ─────────────────────────────────────────────────────
    test("✅ should return 200 with plant OEE aggregate data", async () => {
      oeeService.getPlantOEE.mockResolvedValue(mockPlantOee);

      const res = await request(app).get("/oee/plant");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body._avg).toBeDefined();
      expect(res.body._avg.oeeScore).toBe(76.8);
      expect(oeeService.getPlantOEE).toHaveBeenCalledTimes(1);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      oeeService.getPlantOEE.mockResolvedValue(mockPlantOee);

      const res = await request(app).get("/oee/plant");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should handle null avg values when no OEE records exist", async () => {
      oeeService.getPlantOEE.mockResolvedValue({
        _avg: { availability: null, performance: null, quality: null, oeeScore: null },
      });

      const res = await request(app).get("/oee/plant");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body._avg.oeeScore).toBeNull();
    });

    // ── Authorization Cases ───────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);
      const res = await request(app).get("/oee/plant");
      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(oeeService.getPlantOEE).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get("/oee/plant");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/oee/plant");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Error Cases ───────────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      oeeService.getPlantOEE.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).get("/oee/plant");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma timeout (P1008)", async () => {
      oeeService.getPlantOEE.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );
      const res = await request(app).get("/oee/plant");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /oee/summary
  // ===========================================================================
  describe("GET /oee/summary", () => {

    // ── Success Cases ─────────────────────────────────────────────────────
    test("✅ should return 200 with summary data (no query params)", async () => {
      oeeService.getOEESummary.mockResolvedValue(mockOeeSummary);

      const res = await request(app).get("/oee/summary");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data).toMatchObject({
        availability: expect.any(Number),
        performance: expect.any(Number),
        quality: expect.any(Number),
        oee: expect.any(Number),
        status: expect.any(String),
      });
      expect(oeeService.getOEESummary).toHaveBeenCalledTimes(1);
    });

    test("✅ should return 200 with specific date and plant=3 (default)", async () => {
      oeeService.getOEESummary.mockResolvedValue(mockOeeSummary);

      const res = await request(app).get("/oee/summary?tanggal=2025-01-15&plant=3");

      expect(res.status).toBe(httpStatus.OK);
      expect(oeeService.getOEESummary).toHaveBeenCalledWith("2025-01-15", "3");
    });

    test("✅ should use today date when tanggal not provided", async () => {
      oeeService.getOEESummary.mockResolvedValue(mockOeeSummary);

      await request(app).get("/oee/summary");

      expect(oeeService.getOEESummary).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        "3"
      );
    });

    test("✅ should return status EXCELLENT for OEE >= 85", async () => {
      oeeService.getOEESummary.mockResolvedValue({
        ...mockOeeSummary, oee: 87.0, status: "EXCELLENT",
      });

      const res = await request(app).get("/oee/summary");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.status).toBe("EXCELLENT");
    });

    test("✅ should return status GOOD for OEE 75-84", async () => {
      oeeService.getOEESummary.mockResolvedValue({
        ...mockOeeSummary, oee: 78.0, status: "GOOD",
      });

      const res = await request(app).get("/oee/summary");

      expect(res.body.data.status).toBe("GOOD");
    });

    test("✅ should return status NEEDS_ATTENTION for OEE 65-74", async () => {
      oeeService.getOEESummary.mockResolvedValue({
        ...mockOeeSummary, oee: 68.0, status: "NEEDS_ATTENTION",
      });

      const res = await request(app).get("/oee/summary");

      expect(res.body.data.status).toBe("NEEDS_ATTENTION");
    });

    test("✅ should return status CRITICAL for OEE < 65", async () => {
      oeeService.getOEESummary.mockResolvedValue({
        ...mockOeeSummary, oee: 50.0, status: "CRITICAL",
      });

      const res = await request(app).get("/oee/summary");

      expect(res.body.data.status).toBe("CRITICAL");
    });

    test("✅ should return NO_DATA when no OEE records for date", async () => {
      oeeService.getOEESummary.mockResolvedValue(mockOeeSummaryNoData);

      const res = await request(app).get("/oee/summary?tanggal=2020-01-01");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.status).toBe("NO_DATA");
      expect(res.body.data.oee).toBe(0);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      oeeService.getOEESummary.mockResolvedValue(mockOeeSummary);
      const res = await request(app).get("/oee/summary");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with PRODUKSI role", async () => {
      setRole("PRODUKSI");
      oeeService.getOEESummary.mockResolvedValue(mockOeeSummary);
      const res = await request(app).get("/oee/summary");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept plant=1 filter", async () => {
      oeeService.getOEESummary.mockResolvedValue(mockOeeSummary);

      const res = await request(app).get("/oee/summary?plant=1");

      expect(res.status).toBe(httpStatus.OK);
      expect(oeeService.getOEESummary).toHaveBeenCalledWith(
        expect.any(String),
        "1"
      );
    });

    test("✅ should return all zeros gracefully on zero-data day", async () => {
      oeeService.getOEESummary.mockResolvedValue({
        availability: 0, performance: 0, quality: 0, oee: 0, status: "NO_DATA",
      });

      const res = await request(app).get("/oee/summary");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.availability).toBe(0);
    });

    // ── Authorization Cases ───────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);
      const res = await request(app).get("/oee/summary");
      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(oeeService.getOEESummary).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/oee/summary");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/oee/summary");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).get("/oee/summary");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Error Cases ───────────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      oeeService.getOEESummary.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).get("/oee/summary");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      oeeService.getOEESummary.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );
      const res = await request(app).get("/oee/summary");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma query timeout (P1008)", async () => {
      oeeService.getOEESummary.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );
      const res = await request(app).get("/oee/summary");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should propagate ApiError correctly from service", async () => {
      oeeService.getOEESummary.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Plant not found")
      );
      const res = await request(app).get("/oee/summary?plant=999");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Plant not found");
    });
  });

  // ===========================================================================
  // GET /oee/trend
  // ===========================================================================
  describe("GET /oee/trend", () => {

    // ── Success Cases ─────────────────────────────────────────────────────
    test("✅ should return 200 with 10-day trend data (no filters)", async () => {
      oeeService.getOEETrend.mockResolvedValue(mockOeeTrend);

      const res = await request(app).get("/oee/trend");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data.labels).toHaveLength(10);
      expect(res.body.data.shift1).toHaveLength(10);
      expect(res.body.data.shift2).toHaveLength(10);
      expect(res.body.data.shift3).toHaveLength(10);
      expect(oeeService.getOEETrend).toHaveBeenCalledTimes(1);
    });

    test("✅ should pass tanggal to service", async () => {
      oeeService.getOEETrend.mockResolvedValue(mockOeeTrend);

      await request(app).get("/oee/trend?tanggal=2025-01-15");

      expect(oeeService.getOEETrend).toHaveBeenCalledWith(
        "2025-01-15",
        undefined,
        "3"
      );
    });

    test("✅ should pass shift_ids filter to service", async () => {
      oeeService.getOEETrend.mockResolvedValue(mockOeeTrend);

      await request(app).get("/oee/trend?tanggal=2025-01-15&shift_ids=1");

      expect(oeeService.getOEETrend).toHaveBeenCalledWith(
        "2025-01-15",
        "1",
        "3"
      );
    });

    test("✅ should pass multiple shift_ids to service", async () => {
      oeeService.getOEETrend.mockResolvedValue(mockOeeTrend);

      const res = await request(app).get("/oee/trend?shift_ids[]=1&shift_ids[]=2");

      expect(oeeService.getOEETrend).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should use today date when tanggal not provided", async () => {
      oeeService.getOEETrend.mockResolvedValue(mockOeeTrend);

      await request(app).get("/oee/trend");

      expect(oeeService.getOEETrend).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        undefined,
        "3"
      );
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      oeeService.getOEETrend.mockResolvedValue(mockOeeTrend);
      const res = await request(app).get("/oee/trend");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with PRODUKSI role", async () => {
      setRole("PRODUKSI");
      oeeService.getOEETrend.mockResolvedValue(mockOeeTrend);
      const res = await request(app).get("/oee/trend");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return all zeros for shifts with no data", async () => {
      const zeroTrend = {
        labels: ["06","07","08","09","10","11","12","13","14","15"],
        shift1: [0,0,0,0,0,0,0,0,0,0],
        shift2: [0,0,0,0,0,0,0,0,0,0],
        shift3: [0,0,0,0,0,0,0,0,0,0],
      };
      oeeService.getOEETrend.mockResolvedValue(zeroTrend);

      const res = await request(app).get("/oee/trend");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.shift1.every((v) => v === 0)).toBe(true);
    });

    test("✅ should accept plant filter", async () => {
      oeeService.getOEETrend.mockResolvedValue(mockOeeTrend);
      const res = await request(app).get("/oee/trend?plant=1");
      expect(res.status).toBe(httpStatus.OK);
      expect(oeeService.getOEETrend).toHaveBeenCalledWith(
        expect.any(String), undefined, "1"
      );
    });

    // ── Authorization Cases ───────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);
      const res = await request(app).get("/oee/trend");
      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(oeeService.getOEETrend).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/oee/trend");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/oee/trend");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Error Cases ───────────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      oeeService.getOEETrend.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).get("/oee/trend");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      oeeService.getOEETrend.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );
      const res = await request(app).get("/oee/trend");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should propagate ApiError from service", async () => {
      oeeService.getOEETrend.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Invalid date range")
      );
      const res = await request(app).get("/oee/trend");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });
  });

  // ===========================================================================
  // GET /oee/history
  // ===========================================================================
  describe("GET /oee/history", () => {

    // ── Success Cases ─────────────────────────────────────────────────────
    test("✅ should return 200 with downtime history list", async () => {
      oeeService.getDowntimeHistory.mockResolvedValue(mockDowntimeHistory);

      const res = await request(app).get("/oee/history");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(oeeService.getDowntimeHistory).toHaveBeenCalledTimes(1);
    });

    test("✅ should pass tanggal to service", async () => {
      oeeService.getDowntimeHistory.mockResolvedValue(mockDowntimeHistory);

      await request(app).get("/oee/history?tanggal=2025-01-15");

      expect(oeeService.getDowntimeHistory).toHaveBeenCalledWith("2025-01-15", "3");
    });

    test("✅ should use today date when tanggal not provided", async () => {
      oeeService.getDowntimeHistory.mockResolvedValue(mockDowntimeHistory);

      await request(app).get("/oee/history");

      expect(oeeService.getDowntimeHistory).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        "3"
      );
    });

    test("✅ should return empty array when no downtime on date", async () => {
      oeeService.getDowntimeHistory.mockResolvedValue([]);

      const res = await request(app).get("/oee/history?tanggal=2020-01-01");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(0);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      oeeService.getDowntimeHistory.mockResolvedValue(mockDowntimeHistory);
      const res = await request(app).get("/oee/history");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with PRODUKSI role", async () => {
      setRole("PRODUKSI");
      oeeService.getDowntimeHistory.mockResolvedValue(mockDowntimeHistory);
      const res = await request(app).get("/oee/history");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return history sorted by hours descending", async () => {
      oeeService.getDowntimeHistory.mockResolvedValue(mockDowntimeHistory);

      const res = await request(app).get("/oee/history");

      const data = res.body.data;
      expect(data[0].hours).toBeGreaterThanOrEqual(data[1].hours);
      expect(data[1].hours).toBeGreaterThanOrEqual(data[2].hours);
    });

    test("✅ should accept plant filter and pass to service", async () => {
      oeeService.getDowntimeHistory.mockResolvedValue(mockDowntimeHistory);
      const res = await request(app).get("/oee/history?plant=1");
      expect(res.status).toBe(httpStatus.OK);
      expect(oeeService.getDowntimeHistory).toHaveBeenCalledWith(
        expect.any(String), "1"
      );
    });

    test("✅ should handle single downtime event gracefully", async () => {
      oeeService.getDowntimeHistory.mockResolvedValue([
        { label: "Kerusakan Mesin", hours: 5.0 },
      ]);

      const res = await request(app).get("/oee/history");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].label).toBe("Kerusakan Mesin");
    });

    // ── Authorization Cases ───────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);
      const res = await request(app).get("/oee/history");
      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(oeeService.getDowntimeHistory).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/oee/history");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/oee/history");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).get("/oee/history");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Error Cases ───────────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      oeeService.getDowntimeHistory.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).get("/oee/history");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma query timeout (P1008)", async () => {
      oeeService.getDowntimeHistory.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );
      const res = await request(app).get("/oee/history");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should propagate ApiError from service", async () => {
      oeeService.getDowntimeHistory.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "No downtime records")
      );
      const res = await request(app).get("/oee/history");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("No downtime records");
    });
  });

  // ===========================================================================
  // GET /oee/machine-detail
  // ===========================================================================
  describe("GET /oee/machine-detail", () => {

    // ── Success Cases ─────────────────────────────────────────────────────
    test("✅ should return 200 with machine detail list", async () => {
      oeeService.getMachineDetail.mockResolvedValue(mockMachineDetail);

      const res = await request(app).get("/oee/machine-detail");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(oeeService.getMachineDetail).toHaveBeenCalledTimes(1);
    });

    test("✅ should pass tanggal to service", async () => {
      oeeService.getMachineDetail.mockResolvedValue(mockMachineDetail);

      await request(app).get("/oee/machine-detail?tanggal=2025-01-15");

      expect(oeeService.getMachineDetail).toHaveBeenCalledWith("2025-01-15", "3");
    });

    test("✅ should use today date when tanggal not provided", async () => {
      oeeService.getMachineDetail.mockResolvedValue(mockMachineDetail);

      await request(app).get("/oee/machine-detail");

      expect(oeeService.getMachineDetail).toHaveBeenCalledWith(
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        "3"
      );
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      oeeService.getMachineDetail.mockResolvedValue(mockMachineDetail);
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with PRODUKSI role", async () => {
      setRole("PRODUKSI");
      oeeService.getMachineDetail.mockResolvedValue(mockMachineDetail);
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return correct machine-level shift data structure", async () => {
      oeeService.getMachineDetail.mockResolvedValue(mockMachineDetail);

      const res = await request(app).get("/oee/machine-detail");

      const machine = res.body.data[0];
      expect(machine.machineName).toBe("Mesin 10");
      expect(machine.shifts.shift1).toMatchObject({
        ok: expect.any(Number),
        ng: expect.any(Number),
        downtime: expect.any(Number),
        target: expect.any(Number),
      });
    });

    test("✅ should return correct summary fields per machine", async () => {
      oeeService.getMachineDetail.mockResolvedValue(mockMachineDetail);

      const res = await request(app).get("/oee/machine-detail");

      const machine = res.body.data[0];
      expect(machine.summary).toMatchObject({
        availability: expect.any(Number),
        performance: expect.any(Number),
        quality: expect.any(Number),
        oee: expect.any(Number),
      });
    });

    test("✅ should return empty array when no machines active on date", async () => {
      oeeService.getMachineDetail.mockResolvedValue([]);

      const res = await request(app).get("/oee/machine-detail?tanggal=2020-01-01");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(0);
    });

    test("✅ should return multiple machines when active", async () => {
      const multiMachine = [
        ...mockMachineDetail,
        { ...mockMachineDetail[0], machineName: "Mesin 20" },
      ];
      oeeService.getMachineDetail.mockResolvedValue(multiMachine);

      const res = await request(app).get("/oee/machine-detail");

      expect(res.body.data).toHaveLength(2);
    });

    test("✅ should return machine with all-zero summary when no OEE loading time", async () => {
      oeeService.getMachineDetail.mockResolvedValue([
        {
          machineName: "Mesin 30",
          shifts: {
            shift1: { ok: 0, ng: 0, downtime: 0, target: 0 },
            shift2: { ok: 0, ng: 0, downtime: 0, target: 0 },
            shift3: { ok: 0, ng: 0, downtime: 0, target: 0 },
          },
          summary: { availability: 0, performance: 0, quality: 0, oee: 0 },
        },
      ]);

      const res = await request(app).get("/oee/machine-detail");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data[0].summary.oee).toBe(0);
    });

    test("✅ should accept plant filter and pass to service", async () => {
      oeeService.getMachineDetail.mockResolvedValue(mockMachineDetail);
      const res = await request(app).get("/oee/machine-detail?plant=1");
      expect(res.status).toBe(httpStatus.OK);
      expect(oeeService.getMachineDetail).toHaveBeenCalledWith(
        expect.any(String), "1"
      );
    });

    // ── Authorization Cases ───────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(oeeService.getMachineDetail).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Error Cases ───────────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      oeeService.getMachineDetail.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection error (P1001)", async () => {
      oeeService.getMachineDetail.mockRejectedValue(
        Object.assign(new Error("Can't reach database server"), { code: "P1001" })
      );
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma query timeout (P1008)", async () => {
      oeeService.getMachineDetail.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma pool exhausted (P2037)", async () => {
      oeeService.getMachineDetail.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should propagate ApiError from service", async () => {
      oeeService.getMachineDetail.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Machine not found")
      );
      const res = await request(app).get("/oee/machine-detail");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Machine not found");
    });

    // ── Worst Case / Edge Cases ───────────────────────────────────────────
    test("⚠️ should handle very large machine list (stress)", async () => {
      const largeMachineList = Array.from({ length: 100 }, (_, i) => ({
        machineName: `Mesin ${i + 1}`,
        shifts: {
          shift1: { ok: 490, ng: 10, downtime: 20, target: 500 },
          shift2: { ok: 470, ng: 30, downtime: 40, target: 500 },
          shift3: { ok: 0, ng: 0, downtime: 0, target: 0 },
        },
        summary: { availability: 90.0, performance: 88.0, quality: 98.0, oee: 77.7 },
      }));
      oeeService.getMachineDetail.mockResolvedValue(largeMachineList);

      const res = await request(app).get("/oee/machine-detail");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(100);
    });

    test("⚠️ should handle concurrent calls without interference", async () => {
      oeeService.getMachineDetail.mockResolvedValue(mockMachineDetail);

      const results = await Promise.all([
        request(app).get("/oee/machine-detail"),
        request(app).get("/oee/machine-detail"),
        request(app).get("/oee/machine-detail"),
      ]);

      results.forEach((res) => {
        expect(res.status).toBe(httpStatus.OK);
      });
      expect(oeeService.getMachineDetail).toHaveBeenCalledTimes(3);
    });
  });

  // ===========================================================================
  // Cross-cutting: Concurrent & Stress Tests
  // ===========================================================================
  describe("Cross-cutting: Concurrent & Stress Scenarios", () => {

    test("⚠️ concurrent GET /oee/summary, /oee/trend, /oee/history simultaneously", async () => {
      oeeService.getOEESummary.mockResolvedValue(mockOeeSummary);
      oeeService.getOEETrend.mockResolvedValue(mockOeeTrend);
      oeeService.getDowntimeHistory.mockResolvedValue(mockDowntimeHistory);

      const [summaryRes, trendRes, historyRes] = await Promise.all([
        request(app).get("/oee/summary"),
        request(app).get("/oee/trend"),
        request(app).get("/oee/history"),
      ]);

      expect(summaryRes.status).toBe(httpStatus.OK);
      expect(trendRes.status).toBe(httpStatus.OK);
      expect(historyRes.status).toBe(httpStatus.OK);
    });

    test("⚠️ should handle service returning undefined gracefully", async () => {
      oeeService.getOEESummary.mockResolvedValue(undefined);

      const res = await request(app).get("/oee/summary");

      // Controller sends { status: true, data: undefined } — should not crash app
      expect([httpStatus.OK, httpStatus.INTERNAL_SERVER_ERROR]).toContain(res.status);
    });

    test("⚠️ should still respond correctly after a previous request failed", async () => {
      oeeService.getOEESummary.mockRejectedValueOnce(new Error("DB_CRASH"));
      oeeService.getOEESummary.mockResolvedValueOnce(mockOeeSummary);

      const first = await request(app).get("/oee/summary");
      const second = await request(app).get("/oee/summary");

      expect(first.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      expect(second.status).toBe(httpStatus.OK);
    });

    test("⚠️ all dashboard endpoints return 401 when unauthenticated", async () => {
      setLoggedIn(false);

      const endpoints = [
        "/oee/summary",
        "/oee/trend",
        "/oee/history",
        "/oee/machine-detail",
        "/oee/plant",
      ];

      const results = await Promise.all(
        endpoints.map((ep) => request(app).get(ep))
      );

      results.forEach((res) => {
        expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      });
    });
  });
});
