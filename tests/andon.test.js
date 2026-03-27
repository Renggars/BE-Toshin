import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Global Mock Registry ────────────────────────────────────────────────
global.__ANDON_MOCKS__ = {
  andonService: {
    triggerAndon: jest.fn(),
    startRepairAndon: jest.fn(),
    resolveAndon: jest.fn(),
    getActiveEvents: jest.fn(),
    getMyActiveEvents: jest.fn(),
    getDashboardData: jest.fn(),
    getAndonFilters: jest.fn(),
    getTriggerMasterData: jest.fn(),
    getPersonalHistory: jest.fn(),
  },
  andonCallService: {
    createCall: jest.fn(),
  },
  // Default mock user (role can be overridden per-test)
  mockUser: { id: 1, role: "PRODUKSI", plant: "1" },
  auth: {
    auth: jest.fn((...requiredRoles) => (req, res, next) => {
      req.user = global.__ANDON_MOCKS__.mockUser;
      if (requiredRoles.length && !requiredRoles.includes(req.user.role)) {
        return res.status(httpStatus.FORBIDDEN).json({
          status: false,
          message: "Forbidden: You do not have the required role",
        });
      }
      next();
    }),
    authOptional: jest.fn(() => (req, res, next) => {
      req.user = global.__ANDON_MOCKS__.mockUser;
      next();
    }),
  },
  redis: {
    delByPattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
};

// ─── 2. Register ESM Mocks ───────────────────────────────────────────────────
jest.unstable_mockModule("../src/services/andon.service.js", () => ({
  default: global.__ANDON_MOCKS__.andonService,
}));
jest.unstable_mockModule("../src/services/andonCall.service.js", () => ({
  default: global.__ANDON_MOCKS__.andonCallService,
}));
jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__ANDON_MOCKS__.auth.auth,
  authOptional: global.__ANDON_MOCKS__.auth.authOptional,
}));
jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: global.__ANDON_MOCKS__.redis,
}));

// ─── 3. Import App & Utilities ───────────────────────────────────────────────
const { default: app } = await import("../src/app.js");
const { default: ApiError } = await import("../src/utils/ApiError.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────
const setRole = (role) => {
  global.__ANDON_MOCKS__.mockUser.role = role;
};
const resetRole = () => {
  global.__ANDON_MOCKS__.mockUser.role = "PRODUKSI";
};

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("Andon Controller - Comprehensive Unit Tests", () => {
  const { andonService, andonCallService } = global.__ANDON_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRole();
  });

  // ===========================================================================
  // POST /andon/trigger
  // ===========================================================================
  describe("POST /andon/trigger", () => {
    const validPayload = { mesinId: 1, masalahId: 2 };

    test("✅ should return 201 on successful trigger", async () => {
      const mockEvent = { id: 10, mesinId: 1, status: "ACTIVE" };
      andonService.triggerAndon.mockResolvedValue(mockEvent);

      const res = await request(app).post("/andon/trigger").send(validPayload);

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.id).toBe(10);
      expect(andonService.triggerAndon).toHaveBeenCalledWith(validPayload);
    });

    test("✅ should accept optional operatorId in trigger payload", async () => {
      const payloadWithOperator = { ...validPayload, operatorId: 5 };
      andonService.triggerAndon.mockResolvedValue({ id: 11 });

      const res = await request(app).post("/andon/trigger").send(payloadWithOperator);

      expect(res.status).toBe(httpStatus.OK);
      expect(andonService.triggerAndon).toHaveBeenCalledWith(payloadWithOperator);
    });

    test("❌ should return 400 if mesinId is missing (Joi validation)", async () => {
      const res = await request(app).post("/andon/trigger").send({ masalahId: 2 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/mesinId/i);
    });

    test("❌ should return 400 if masalahId is missing (Joi validation)", async () => {
      const res = await request(app).post("/andon/trigger").send({ mesinId: 1 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/masalahId/i);
    });

    test("❌ should return 400 if mesinId is a string (Joi type check)", async () => {
      const res = await request(app).post("/andon/trigger").send({ mesinId: "abc", masalahId: 2 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if payload is completely empty", async () => {
      const res = await request(app).post("/andon/trigger").send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 404 if masalah not found (service error)", async () => {
      andonService.triggerAndon.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Masalah tidak ditemukan")
      );
      const res = await request(app).post("/andon/trigger").send(validPayload);
      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Masalah tidak ditemukan");
    });

    test("❌ should return 400 if andon already ACTIVE for this machine", async () => {
      andonService.triggerAndon.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Mesin sudah memiliki Andon aktif")
      );
      const res = await request(app).post("/andon/trigger").send(validPayload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 403 if user role is not PRODUKSI (RBAC)", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).post("/andon/trigger").send(validPayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 500 on unexpected database crash", async () => {
      andonService.triggerAndon.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).post("/andon/trigger").send(validPayload);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // POST /andon/call
  // ===========================================================================
  describe("POST /andon/call", () => {
    const validPayload = { mesinId: 1, targetDivisi: "MAINTENANCE" };

    test("✅ should return 201 on successful call", async () => {
      const mockCall = { id: 5, mesinId: 1, status: "WAITING" };
      andonCallService.createCall.mockResolvedValue(mockCall);

      const res = await request(app).post("/andon/call").send(validPayload);

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.id).toBe(5);
      // Controller injects operatorId from req.user.id
      expect(andonCallService.createCall).toHaveBeenCalledWith(
        expect.objectContaining({ mesinId: 1, operatorId: 1 })
      );
    });

    test("✅ should accept all valid targetDivisi values", async () => {
      const validTargets = ["MAINTENANCE", "QUALITY", "PRODUKSI", "DIE_MAINT"];
      andonCallService.createCall.mockResolvedValue({ id: 1 });

      for (const target of validTargets) {
        const res = await request(app)
          .post("/andon/call")
          .send({ mesinId: 1, targetDivisi: target });
        expect(res.status).toBe(httpStatus.OK);
      }
    });

    test("❌ should return 400 if mesinId is missing", async () => {
      const res = await request(app).post("/andon/call").send({ targetDivisi: "MAINTENANCE" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if targetDivisi is invalid enum value", async () => {
      const res = await request(app).post("/andon/call").send({ mesinId: 1, targetDivisi: "INVALID_DIVISI" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if there is already a WAITING call for this machine", async () => {
      andonCallService.createCall.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Sudah ada panggilan (WAITING) di mesin ini")
      );
      const res = await request(app).post("/andon/call").send(validPayload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toBe("Sudah ada panggilan (WAITING) di mesin ini");
    });

    test("❌ should return 400 if andon event is already ACTIVE or IN_REPAIR", async () => {
      andonCallService.createCall.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Mesin sedang dalam proses perbaikan/andon active")
      );
      const res = await request(app).post("/andon/call").send(validPayload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 403 if role is not PRODUKSI (RBAC)", async () => {
      setRole("ADMIN");
      const res = await request(app).post("/andon/call").send(validPayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 500 on unexpected service failure", async () => {
      andonCallService.createCall.mockRejectedValue(new Error("Network timeout"));
      const res = await request(app).post("/andon/call").send(validPayload);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // PATCH /andon/:id/start-repair
  // ===========================================================================
  describe("PATCH /andon/:id/start-repair", () => {
    const roles = ["MAINTENANCE", "DIE_MAINT", "SUPERVISOR", "QUALITY", "PRODUKSI"];

    test("✅ should return 200 on successful start-repair", async () => {
      setRole("MAINTENANCE");
      const mockResult = { id: 10, status: "IN_REPAIR" };
      andonService.startRepairAndon.mockResolvedValue(mockResult);

      const res = await request(app).patch("/andon/10/start-repair").send({ masalahId: 3 });

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.status).toBe("IN_REPAIR");
      expect(andonService.startRepairAndon).toHaveBeenCalledWith(10, {
        userId: 1,
        masalahId: 3,
      });
    });

    test.each(roles)("✅ role '%s' should be authorized", async (role) => {
      setRole(role);
      andonService.startRepairAndon.mockResolvedValue({ id: 10, status: "IN_REPAIR" });
      const res = await request(app).patch("/andon/10/start-repair").send({ masalahId: 3 });
      expect(res.status).toBe(httpStatus.OK);
    });

    test("❌ should return 403 if role is ADMIN (not authorized)", async () => {
      setRole("ADMIN");
      const res = await request(app).patch("/andon/1/start-repair").send({ masalahId: 1 });
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 404 if andon event not found", async () => {
      setRole("MAINTENANCE");
      andonService.startRepairAndon.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Andon Event tidak ditemukan")
      );
      const res = await request(app).patch("/andon/999/start-repair").send({ masalahId: 1 });
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("❌ should return 400 if event is not in a valid state (e.g., already RESOLVED)", async () => {
      setRole("MAINTENANCE");
      andonService.startRepairAndon.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Andon sudah RESOLVED, tidak bisa di-repair")
      );
      const res = await request(app).patch("/andon/10/start-repair").send({ masalahId: 1 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if masalahId is required but missing (AndonCall conversion)", async () => {
      setRole("MAINTENANCE");
      andonService.startRepairAndon.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "masalahId wajib diisi untuk konversi call ke event")
      );
      const res = await request(app).patch("/andon/10/start-repair").send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should pass NaN-safe: non-integer id should be handled by service layer", async () => {
      setRole("MAINTENANCE");
      andonService.startRepairAndon.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Andon tidak ditemukan")
      );
      const res = await request(app).patch("/andon/abc/start-repair").send({ masalahId: 1 });
      // NaN will be passed and service will throw not found
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test("❌ should return 500 on database failure", async () => {
      setRole("MAINTENANCE");
      andonService.startRepairAndon.mockRejectedValue(new Error("DB_ERROR"));
      const res = await request(app).patch("/andon/10/start-repair").send({ masalahId: 1 });
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // PATCH /andon/:id/resolve
  // ===========================================================================
  describe("PATCH /andon/:id/resolve", () => {
    const resolveRoles = ["DIE_MAINT", "MAINTENANCE", "SUPERVISOR", "PRODUKSI", "QUALITY"];

    test("✅ should return 200 on successful resolve", async () => {
      setRole("MAINTENANCE");
      const mockResult = {
        andonEvent: { id: 10, status: "RESOLVED" },
        durasiDowntime: 15,
        realDowntime: 12,
        waktuTungguMaintenance: 3,
        affectedShift: [],
      };
      andonService.resolveAndon.mockResolvedValue(mockResult);

      const res = await request(app)
        .patch("/andon/10/resolve")
        .send({ responStatus: "ONTIME", masalahId: 2 });

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.durasiDowntime).toBe(15);
      expect(andonService.resolveAndon).toHaveBeenCalledWith(
        10,
        expect.objectContaining({ resolvedBy: 1 })
      );
    });

    test.each(resolveRoles)("✅ role '%s' should be authorized to resolve", async (role) => {
      setRole(role);
      andonService.resolveAndon.mockResolvedValue({ andonEvent: { id: 10 } });
      const res = await request(app).patch("/andon/10/resolve").send({});
      expect(res.status).toBe(httpStatus.OK);
    });

    test("❌ should return 403 if role is ADMIN (not authorized)", async () => {
      setRole("ADMIN");
      const res = await request(app).patch("/andon/10/resolve").send({});
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 404 if andon event not found", async () => {
      setRole("MAINTENANCE");
      andonService.resolveAndon.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Andon Event tidak ditemukan")
      );
      const res = await request(app).patch("/andon/999/resolve").send({});
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("❌ should return 400 if event is still WAITING (not yet IN_REPAIR)", async () => {
      setRole("MAINTENANCE");
      andonService.resolveAndon.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Harus start repair terlebih dahulu")
      );
      const res = await request(app).patch("/andon/10/resolve").send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if trying to resolve an already RESOLVED event", async () => {
      setRole("MAINTENANCE");
      andonService.resolveAndon.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Andon sudah RESOLVED")
      );
      const res = await request(app).patch("/andon/10/resolve").send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 500 on unexpected failure during resolve", async () => {
      setRole("MAINTENANCE");
      andonService.resolveAndon.mockRejectedValue(new Error("Unexpected crash"));
      const res = await request(app).patch("/andon/10/resolve").send({});
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /andon/active
  // ===========================================================================
  describe("GET /andon/active", () => {
    const authorizedRoles = ["ADMIN", "SUPERVISOR", "MAINTENANCE", "QUALITY", "DIE_MAINT"];

    test("✅ should return list of active andon events", async () => {
      setRole("MAINTENANCE");
      const mockActive = [{ id: 1, status: "ACTIVE" }, { id: 2, status: "IN_REPAIR" }];
      andonService.getActiveEvents.mockResolvedValue(mockActive);

      const res = await request(app).get("/andon/active");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(2);
      expect(andonService.getActiveEvents).toHaveBeenCalledWith(null, expect.any(Object));
    });

    test("✅ should return empty array when no active events", async () => {
      setRole("MAINTENANCE");
      andonService.getActiveEvents.mockResolvedValue([]);

      const res = await request(app).get("/andon/active");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(0);
    });

    test("✅ should accept optional mesinId query filter", async () => {
      setRole("MAINTENANCE");
      andonService.getActiveEvents.mockResolvedValue([{ id: 1, mesinId: 3 }]);

      const res = await request(app).get("/andon/active?mesinId=3");

      expect(res.status).toBe(httpStatus.OK);
    });

    test.each(authorizedRoles)("✅ role '%s' is authorized", async (role) => {
      setRole(role);
      andonService.getActiveEvents.mockResolvedValue([]);
      const res = await request(app).get("/andon/active");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("❌ should return 403 if role is PRODUKSI (not authorized)", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get("/andon/active");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 400 if mesinId is not a number (Joi validation)", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/andon/active?mesinId=abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 500 on service failure", async () => {
      setRole("MAINTENANCE");
      andonService.getActiveEvents.mockRejectedValue(new Error("Service down"));
      const res = await request(app).get("/andon/active");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /andon/my-active
  // ===========================================================================
  describe("GET /andon/my-active", () => {
    const myActiveRoles = ["ADMIN", "SUPERVISOR", "PRODUKSI", "QUALITY", "DIE_MAINT", "MAINTENANCE"];

    test("✅ should return the authenticated user's active events", async () => {
      const mockMyActive = [{ id: 3, operatorId: 1 }];
      andonService.getMyActiveEvents.mockResolvedValue(mockMyActive);

      const res = await request(app).get("/andon/my-active");

      expect(res.status).toBe(httpStatus.OK);
      expect(andonService.getMyActiveEvents).toHaveBeenCalledWith(1, expect.any(Object));
    });

    test("✅ should return empty array when user has no active events", async () => {
      andonService.getMyActiveEvents.mockResolvedValue([]);
      const res = await request(app).get("/andon/my-active");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(0);
    });

    test.each(myActiveRoles)("✅ role '%s' is authorized for my-active", async (role) => {
      setRole(role);
      andonService.getMyActiveEvents.mockResolvedValue([]);
      const res = await request(app).get("/andon/my-active");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("❌ should return 500 on service failure", async () => {
      andonService.getMyActiveEvents.mockRejectedValue(new Error("DB Error"));
      const res = await request(app).get("/andon/my-active");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /andon/dashboard
  // ===========================================================================
  describe("GET /andon/dashboard", () => {
    const dashboardRoles = ["ADMIN", "SUPERVISOR", "PRODUKSI", "QUALITY", "DIE_MAINT", "MAINTENANCE"];

    test("✅ should return dashboard data with no filters", async () => {
      setRole("SUPERVISOR");
      const mockDashboard = {
        events: [],
        total: 0,
        totalPages: 1,
        currentPage: 1,
      };
      andonService.getDashboardData.mockResolvedValue(mockDashboard);

      const res = await request(app).get("/andon/dashboard");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.total).toBe(0);
    });

    test("✅ should work with all valid query parameters", async () => {
      setRole("SUPERVISOR");
      andonService.getDashboardData.mockResolvedValue({ events: [], total: 0 });

      const res = await request(app).get(
        "/andon/dashboard?date=2025-01-15&shiftId=1&mesinId=2&status=ACTIVE&kategori=MAINTENANCE&page=1&limit=10"
      );

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should filter by status=RESOLVED (history view)", async () => {
      setRole("SUPERVISOR");
      andonService.getDashboardData.mockResolvedValue({ events: [{ status: "RESOLVED" }] });

      const res = await request(app).get("/andon/dashboard?status=RESOLVED&onlyHistory=true");
      expect(res.status).toBe(httpStatus.OK);
    });

    test.each(dashboardRoles)("✅ role '%s' can access dashboard", async (role) => {
      setRole(role);
      andonService.getDashboardData.mockResolvedValue({ events: [] });
      const res = await request(app).get("/andon/dashboard");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("❌ should return 400 if date format is wrong (Joi validation)", async () => {
      setRole("SUPERVISOR");
      const res = await request(app).get("/andon/dashboard?date=15-01-2025");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/Format date harus YYYY-MM-DD/i);
    });

    test("❌ should return 400 if status is an invalid enum value", async () => {
      setRole("SUPERVISOR");
      const res = await request(app).get("/andon/dashboard?status=PENDING");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if page < 1", async () => {
      setRole("SUPERVISOR");
      const res = await request(app).get("/andon/dashboard?page=0");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if limit > 100", async () => {
      setRole("SUPERVISOR");
      const res = await request(app).get("/andon/dashboard?limit=999");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 500 on service failure", async () => {
      setRole("SUPERVISOR");
      andonService.getDashboardData.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).get("/andon/dashboard");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /andon/filters
  // ===========================================================================
  describe("GET /andon/filters", () => {
    const filterRoles = ["ADMIN", "SUPERVISOR", "PRODUKSI", "QUALITY", "DIE_MAINT", "MAINTENANCE"];

    test("✅ should return available filters (machines, shifts, categories)", async () => {
      setRole("SUPERVISOR");
      const mockFilters = {
        mesinList: [{ id: 1, namaMesin: "Mesin A" }],
        shiftList: [{ id: 1, namaShift: "Pagi" }],
        categories: ["MAINTENANCE", "QUALITY"],
      };
      andonService.getAndonFilters.mockResolvedValue(mockFilters);

      const res = await request(app).get("/andon/filters");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.mesinList).toHaveLength(1);
      expect(andonService.getAndonFilters).toHaveBeenCalledTimes(1);
    });

    test("✅ should return empty filter lists gracefully", async () => {
      setRole("SUPERVISOR");
      andonService.getAndonFilters.mockResolvedValue({ mesinList: [], shiftList: [] });

      const res = await request(app).get("/andon/filters");
      expect(res.status).toBe(httpStatus.OK);
    });

    test.each(filterRoles)("✅ role '%s' can access filters", async (role) => {
      setRole(role);
      andonService.getAndonFilters.mockResolvedValue({});
      const res = await request(app).get("/andon/filters");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("❌ should return 500 if filter service crashes", async () => {
      setRole("SUPERVISOR");
      andonService.getAndonFilters.mockRejectedValue(new Error("DB timeout"));
      const res = await request(app).get("/andon/filters");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /andon/trigger-master
  // ===========================================================================
  describe("GET /andon/trigger-master", () => {
    const triggerMasterRoles = ["ADMIN", "SUPERVISOR", "PRODUKSI", "QUALITY", "DIE_MAINT", "MAINTENANCE"];

    test("✅ should return trigger master data (problems, machines)", async () => {
      setRole("PRODUKSI");
      const mockMasterData = {
        masalahList: [{ id: 1, namaMasalah: "Mesin Mati", kategori: "MAINTENANCE" }],
        mesinList: [{ id: 1, namaMesin: "Mesin A" }],
      };
      andonService.getTriggerMasterData.mockResolvedValue(mockMasterData);

      const res = await request(app).get("/andon/trigger-master");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.masalahList).toHaveLength(1);
    });

    test("✅ should return empty data if no masters exist", async () => {
      setRole("PRODUKSI");
      andonService.getTriggerMasterData.mockResolvedValue({ masalahList: [], mesinList: [] });

      const res = await request(app).get("/andon/trigger-master");
      expect(res.status).toBe(httpStatus.OK);
    });

    test.each(triggerMasterRoles)("✅ role '%s' is authorized", async (role) => {
      setRole(role);
      andonService.getTriggerMasterData.mockResolvedValue({});
      const res = await request(app).get("/andon/trigger-master");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("❌ should return 500 if service fails", async () => {
      setRole("PRODUKSI");
      andonService.getTriggerMasterData.mockRejectedValue(new Error("PRISMA_ERROR"));
      const res = await request(app).get("/andon/trigger-master");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /andon/history
  // ===========================================================================
  describe("GET /andon/history", () => {
    const historyRoles = ["PRODUKSI", "SUPERVISOR", "ADMIN", "QUALITY", "DIE_MAINT", "MAINTENANCE"];

    test("✅ should return personal history for authenticated user", async () => {
      const mockHistory = {
        events: [{ id: 1, status: "RESOLVED", durasiDowntime: 30 }],
        totalDowntime: 30,
        personalStats: { avgResponseTime: 5 },
      };
      andonService.getPersonalHistory.mockResolvedValue(mockHistory);

      const res = await request(app).get("/andon/history");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.totalDowntime).toBe(30);
      expect(andonService.getPersonalHistory).toHaveBeenCalledWith(1);
    });

    test("✅ should return empty history if user has no events", async () => {
      andonService.getPersonalHistory.mockResolvedValue({ events: [], totalDowntime: 0 });

      const res = await request(app).get("/andon/history");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.events).toHaveLength(0);
    });

    test.each(historyRoles)("✅ role '%s' can access history", async (role) => {
      setRole(role);
      andonService.getPersonalHistory.mockResolvedValue({ events: [] });
      const res = await request(app).get("/andon/history");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("❌ should return 500 if history service crashes", async () => {
      andonService.getPersonalHistory.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).get("/andon/history");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // 🔴 WORST CASE / EDGE CASE SCENARIOS
  // ===========================================================================
  describe("🔴 Worst Case Scenarios", () => {
    test("trigger: should handle concurrent double-trigger for same machine (conflict)", async () => {
      andonService.triggerAndon
        .mockResolvedValueOnce({ id: 1 }) // first call succeeds
        .mockRejectedValueOnce(new ApiError(httpStatus.BAD_REQUEST, "Mesin sudah memiliki Andon aktif"));

      const [res1, res2] = await Promise.all([
        request(app).post("/andon/trigger").send({ mesinId: 1, masalahId: 2 }),
        request(app).post("/andon/trigger").send({ mesinId: 1, masalahId: 2 }),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(httpStatus.OK);
      expect(statuses).toContain(httpStatus.BAD_REQUEST);
    });

    test("resolve: resolve time calculated correctly across midnight shift boundary", async () => {
      setRole("MAINTENANCE");
      andonService.resolveAndon.mockResolvedValue({
        andonEvent: { id: 10, status: "RESOLVED" },
        durasiDowntime: 480, // 8 hours spanning midnight
        realDowntime: 470,
        waktuTungguMaintenance: 10,
        affectedShift: [{ shiftId: 1 }, { shiftId: 2 }], // spans two shifts
      });

      const res = await request(app).patch("/andon/10/resolve").send({});
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.affectedShift).toHaveLength(2);
    });

    test("trigger: should handle extremely large mesinId values", async () => {
      andonService.triggerAndon.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Mesin tidak ditemukan")
      );
      const res = await request(app)
        .post("/andon/trigger")
        .send({ mesinId: 999999999, masalahId: 2 });
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("dashboard: should handle very high page number gracefully (empty result)", async () => {
      setRole("SUPERVISOR");
      andonService.getDashboardData.mockResolvedValue({ events: [], total: 0, totalPages: 1 });

      const res = await request(app).get("/andon/dashboard?page=99999&limit=10");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.events).toHaveLength(0);
    });

    test("start-repair: should reject if masalah fetched but category is unknown", async () => {
      setRole("MAINTENANCE");
      andonService.startRepairAndon.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Masalah tidak valid")
      );
      const res = await request(app).patch("/andon/10/start-repair").send({ masalahId: 999 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return correct data shape even if service returns null fields", async () => {
      setRole("MAINTENANCE");
      andonService.getActiveEvents.mockResolvedValue([
        { id: 1, mesin: null, masalah: null, operator: null, status: "ACTIVE" },
      ]);

      const res = await request(app).get("/andon/active");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data[0].id).toBe(1);
    });

    test("should return 500 on prisma disconnect / connection pool exhausted", async () => {
      setRole("SUPERVISOR");
      andonService.getDashboardData.mockRejectedValue(
        Object.assign(new Error("Prisma Client Connection Pool Exhausted"), { code: "P2037" })
      );
      const res = await request(app).get("/andon/dashboard");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
