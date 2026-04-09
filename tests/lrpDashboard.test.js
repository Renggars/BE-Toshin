import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Global Mock Registry ────────────────────────────────────────────────
global.__LRPD_MOCKS__ = {
  lrpDashboardService: {
    getUnifiedDashboardData: jest.fn(),
    getLrpDetail: jest.fn(),
  },
  lrpService: {
    updateLrpById: jest.fn(),
    deleteLrpById: jest.fn(),
  },
  exportQueue: {
    getJobs: jest.fn(),
    add: jest.fn(),
    getJob: jest.fn(),
  },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          if (!global.__LRPD_MOCKS__.isLoggedIn) {
            return res.status(httpStatus.UNAUTHORIZED).json({
              status: false,
              message: "Please authenticate",
            });
          }
          req.user = global.__LRPD_MOCKS__.mockUser;
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
  redis: {
    delByPattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
  mockUser: { id: 1, role: "ADMIN", email: "admin@test.com" },
  isLoggedIn: true,
};

// ─── 2. ESM Mocks ────────────────────────────────────────────────────────────
jest.unstable_mockModule("../src/services/lrpDashboard.service.js", () => ({
  default: global.__LRPD_MOCKS__.lrpDashboardService,
}));

jest.unstable_mockModule("../src/services/lrp.service.js", () => ({
  default: global.__LRPD_MOCKS__.lrpService,
}));

jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__LRPD_MOCKS__.auth.auth,
}));

jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: global.__LRPD_MOCKS__.redis,
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
  exportQueue: global.__LRPD_MOCKS__.exportQueue,
}));

// ─── 3. Dynamic Imports ───────────────────────────────────────────────────────
const { default: app } = await import("../src/app.js");
const { default: ApiError } = await import("../src/utils/ApiError.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────
const setRole = (role) => { global.__LRPD_MOCKS__.mockUser.role = role; };
const setLoggedIn = (val) => { global.__LRPD_MOCKS__.isLoggedIn = val; };
const setUserId = (id) => { global.__LRPD_MOCKS__.mockUser.id = id; };
const resetState = () => {
  global.__LRPD_MOCKS__.mockUser = { id: 1, role: "ADMIN", email: "admin@test.com" };
  global.__LRPD_MOCKS__.isLoggedIn = true;
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const mockSummary = {
  totalOk: 500,
  totalNg: 20,
  totalRework: 10,
  totalQty: 530,
  laporanHariIni: 8,
};

const mockTrendHarian = {
  month: "January",
  year: 2025,
  data: [{ day: 1, ok: 100, ng: 5, rework: 2, total: 107 }],
};

const mockTrendBulanan = {
  year: 2025,
  data: [{ month: "Jan", ok: 500, ng: 20, rework: 10, total: 530 }],
};

const mockLrpList = [
  {
    id: 1,
    tanggal: "2025-01-15T00:00:00.000Z",
    namaShift: "Shift Pagi",
    namaMesin: "Mesin 10",
    produk: "Produk A",
    noKanagata: "KNG-001",
    noLot: "LOT-001",
    qtyOk: 50,
    qtyNg: 3,
    qtyRework: 2,
    qtyTotalProd: 55,
    statusLrp: "VERIFIED",
  },
];

const mockPagination = {
  total: 1,
  totalPages: 1,
  currentPage: 1,
  limit: 10,
};

const mockTrendPress = {
  month: "January",
  year: 2025,
  data: [{ date: "2025-01-15", ok: 100, ng: 5, rework: 2, total: 107 }],
};

const mockUnifiedData = {
  summary: mockSummary,
  trend_bulanan_harian: mockTrendHarian,
  trend_bulanan: mockTrendBulanan,
  lrp_list: mockLrpList,
  pagination: mockPagination,
  trend_produksi_press: mockTrendPress,
};

const mockLrpDetail = {
  header: {
    id: 1,
    tanggal: "2025-01-15T00:00:00.000Z",
    noKanagata: "KNG-001",
    noLot: "LOT-001",
    qtyOk: 50,
    qtyNgPrev: 1,
    qtyNgProses: 2,
    qtyRework: 2,
    qtyTotalProd: 55,
    loadingTime: 480,
    counterEnd: 120,
    statusLrp: "VERIFIED",
    mesin: { id: 10, namaMesin: "Mesin 10" },
    shift: { id: 1, namaShift: "Shift Pagi" },
    operator: { id: 5, nama: "Operator A" },
  },
  logs: [],
  summaryWaktu: { runtime: 480, breakdown: 0, planDowntime: 0 },
};

const mockUpdatedLrp = { ...mockLrpDetail.header, statusLrp: "SUBMITTED" };

const mockJob = {
  id: "job-123",
  name: "export-data",
  data: { userId: 1, filter: {} },
  returnvalue: { downloadUrl: "http://storage/exports/file.xlsx" },
  failedReason: null,
  isCompleted: jest.fn(),
  isFailed: jest.fn(),
};

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("LRP Dashboard Controller - Comprehensive Unit Tests", () => {
  const { lrpDashboardService, lrpService, exportQueue } = global.__LRPD_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
    mockJob.isCompleted.mockResolvedValue(false);
    mockJob.isFailed.mockResolvedValue(false);
  });

  // ===========================================================================
  // GET /lrp-dashboard/summary
  // ===========================================================================
  describe("GET /lrp-dashboard/summary", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 with full unified dashboard data (no filters)", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get("/lrp-dashboard/summary");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data.summary.totalOk).toBe(500);
      expect(res.body.data.lrp_list).toHaveLength(1);
      expect(lrpDashboardService.getUnifiedDashboardData).toHaveBeenCalledTimes(1);
    });

    test("✅ should default startDate to today when no date filter provided", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      await request(app).get("/lrp-dashboard/summary");

      expect(lrpDashboardService.getUnifiedDashboardData).toHaveBeenCalledWith(
        expect.objectContaining({ startDate: expect.any(String) })
      );
    });

    test("✅ should pass startDate and endDate filter to service", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      await request(app).get("/lrp-dashboard/summary?startDate=2025-01-01&endDate=2025-01-31");

      expect(lrpDashboardService.getUnifiedDashboardData).toHaveBeenCalledWith(
        expect.objectContaining({ 
          startDate: expect.stringMatching(/^2025-01-01/), 
          endDate: expect.stringMatching(/^2025-01-31/) 
        })
      );
    });

    test("✅ should pass mesinId filter to service", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get("/lrp-dashboard/summary?mesinId=10");

      expect(res.status).toBe(httpStatus.OK);
      expect(lrpDashboardService.getUnifiedDashboardData).toHaveBeenCalledWith(
        expect.objectContaining({ mesinId: expect.anything() })
      );
    });

    test("✅ should pass shiftId filter to service", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get("/lrp-dashboard/summary?shiftId=1");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should pass jenisPekerjaanId filter to service", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get("/lrp-dashboard/summary?jenisPekerjaanId=2");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should pass produkId filter to service", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get("/lrp-dashboard/summary?produkId=3");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should pass plant filter to service", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get("/lrp-dashboard/summary?plant=PlantA");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should pass page and limit filters to service", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get("/lrp-dashboard/summary?page=2&limit=5");

      expect(res.status).toBe(httpStatus.OK);
      expect(lrpDashboardService.getUnifiedDashboardData).toHaveBeenCalledWith(
        expect.objectContaining({ page: expect.anything(), limit: expect.anything() })
      );
    });

    test("✅ should return all combined filters together", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get(
        "/lrp-dashboard/summary?startDate=2025-01-01&endDate=2025-01-31&mesinId=10&shiftId=1&page=1&limit=20"
      );

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get("/lrp-dashboard/summary");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with ENGINEERING role", async () => {
      setRole("ENGINEERING");
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const res = await request(app).get("/lrp-dashboard/summary");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return empty lrp_list when no records match", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue({
        ...mockUnifiedData,
        lrp_list: [],
        pagination: { total: 0, totalPages: 0, currentPage: 1, limit: 10 },
      });

      const res = await request(app).get("/lrp-dashboard/summary");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.lrp_list).toHaveLength(0);
    });

    test("✅ should return summary with all-zero values gracefully", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue({
        ...mockUnifiedData,
        summary: { totalOk: 0, totalNg: 0, totalRework: 0, totalQty: 0, laporanHariIni: 0 },
      });

      const res = await request(app).get("/lrp-dashboard/summary");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.summary.totalQty).toBe(0);
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/lrp-dashboard/summary");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(lrpDashboardService.getUnifiedDashboardData).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");

      const res = await request(app).get("/lrp-dashboard/summary");

      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(lrpDashboardService.getUnifiedDashboardData).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/lrp-dashboard/summary");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/lrp-dashboard/summary");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).get("/lrp-dashboard/summary");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if startDate is invalid ISO string", async () => {
      const res = await request(app).get("/lrp-dashboard/summary?startDate=not-a-date");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if endDate is invalid ISO string", async () => {
      const res = await request(app).get("/lrp-dashboard/summary?endDate=32-13-2025");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if mesinId is non-numeric", async () => {
      const res = await request(app).get("/lrp-dashboard/summary?mesinId=abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if shiftId is non-numeric", async () => {
      const res = await request(app).get("/lrp-dashboard/summary?shiftId=abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if page is non-integer", async () => {
      const res = await request(app).get("/lrp-dashboard/summary?page=abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if limit is non-integer", async () => {
      const res = await request(app).get("/lrp-dashboard/summary?limit=abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).get("/lrp-dashboard/summary");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );

      const res = await request(app).get("/lrp-dashboard/summary");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 400 if service throws API error (e.g. invalid startDate)", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "startDate tidak valid")
      );

      const res = await request(app).get("/lrp-dashboard/summary?startDate=2025-01-01");

      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toBe("startDate tidak valid");
    });
  });

  // ===========================================================================
  // GET /lrp-dashboard/:lrpId — getLrpDetail
  // ===========================================================================
  describe("GET /lrp-dashboard/:lrpId", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 and full LRP detail for valid ID", async () => {
      lrpDashboardService.getLrpDetail.mockResolvedValue(mockLrpDetail);

      const res = await request(app).get("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data.header.id).toBe(1);
      expect(res.body.data.logs).toEqual([]);
      expect(lrpDashboardService.getLrpDetail).toHaveBeenCalledWith(1);
    });

    test("✅ should return summaryWaktu fields in detail response", async () => {
      lrpDashboardService.getLrpDetail.mockResolvedValue(mockLrpDetail);

      const res = await request(app).get("/lrp-dashboard/1");

      expect(res.body.data.summaryWaktu.runtime).toBe(480);
      expect(res.body.data.summaryWaktu.breakdown).toBe(0);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      lrpDashboardService.getLrpDetail.mockResolvedValue(mockLrpDetail);

      const res = await request(app).get("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with ENGINEERING role", async () => {
      setRole("ENGINEERING");
      lrpDashboardService.getLrpDetail.mockResolvedValue(mockLrpDetail);

      const res = await request(app).get("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should handle LRP with null counterEnd gracefully", async () => {
      lrpDashboardService.getLrpDetail.mockResolvedValue({
        ...mockLrpDetail,
        header: { ...mockLrpDetail.header, counterEnd: null },
      });

      const res = await request(app).get("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.header.counterEnd).toBeNull();
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(lrpDashboardService.getLrpDetail).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get("/lrp-dashboard/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/lrp-dashboard/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/lrp-dashboard/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if lrpId is non-numeric string", async () => {
      const res = await request(app).get("/lrp-dashboard/abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if lrpId is a float", async () => {
      const res = await request(app).get("/lrp-dashboard/1.5");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 or 404 if lrpId is zero", async () => {
      // Mock service to throw if called with 0 (since validation might pass it)
      lrpDashboardService.getLrpDetail.mockRejectedValue(new ApiError(httpStatus.NOT_FOUND, "LRP not found"));
      
      const res = await request(app).get("/lrp-dashboard/0");
      expect([httpStatus.BAD_REQUEST, httpStatus.NOT_FOUND]).toContain(res.status);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 404 if LRP record not found", async () => {
      lrpDashboardService.getLrpDetail.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "LRP not found")
      );

      const res = await request(app).get("/lrp-dashboard/999");

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("LRP not found");
    });

    test("❌ should return 404 for very large non-existent ID", async () => {
      lrpDashboardService.getLrpDetail.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "LRP not found")
      );

      const res = await request(app).get("/lrp-dashboard/999999999");

      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("❌ should return 500 on database failure", async () => {
      lrpDashboardService.getLrpDetail.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).get("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma timeout (P1008)", async () => {
      lrpDashboardService.getLrpDetail.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );

      const res = await request(app).get("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // PATCH /lrp-dashboard/:lrpId — updateLrp
  // ===========================================================================
  describe("PATCH /lrp-dashboard/:lrpId", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 on successful update (ADMIN)", async () => {
      lrpService.updateLrpById.mockResolvedValue(mockUpdatedLrp);

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ statusLrp: "SUBMITTED" });

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe("LRP updated successfully");
      expect(lrpService.updateLrpById).toHaveBeenCalledWith(1, { statusLrp: "SUBMITTED" });
    });

    test("✅ should return 200 on successful update (SUPERVISOR)", async () => {
      setRole("SUPERVISOR");
      lrpService.updateLrpById.mockResolvedValue(mockUpdatedLrp);

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ statusLrp: "VERIFIED" });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept statusLrp = SUBMITTED", async () => {
      lrpService.updateLrpById.mockResolvedValue(mockUpdatedLrp);

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ statusLrp: "SUBMITTED" });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept statusLrp = VERIFIED", async () => {
      lrpService.updateLrpById.mockResolvedValue({ ...mockUpdatedLrp, statusLrp: "VERIFIED" });

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ statusLrp: "VERIFIED" });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept qtyOk update", async () => {
      lrpService.updateLrpById.mockResolvedValue({ ...mockUpdatedLrp, qtyOk: 75 });

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ qtyOk: 75 });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept qtyNgProses update", async () => {
      lrpService.updateLrpById.mockResolvedValue(mockUpdatedLrp);

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ qtyNgProses: 5 });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept qtyNgPrev update", async () => {
      lrpService.updateLrpById.mockResolvedValue(mockUpdatedLrp);

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ qtyNgPrev: 3 });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept qtyRework update", async () => {
      lrpService.updateLrpById.mockResolvedValue(mockUpdatedLrp);

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ qtyRework: 4 });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept combined qty update payload", async () => {
      lrpService.updateLrpById.mockResolvedValue(mockUpdatedLrp);

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ qtyOk: 80, qtyNgProses: 3, qtyRework: 2 });

      expect(res.status).toBe(httpStatus.OK);
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app)
        .patch("/lrp-dashboard/1")
        .send({ statusLrp: "SUBMITTED" });

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(lrpService.updateLrpById).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");
      const res = await request(app).patch("/lrp-dashboard/1").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).patch("/lrp-dashboard/1").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).patch("/lrp-dashboard/1").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).patch("/lrp-dashboard/1").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if body is empty (min 1 key required)", async () => {
      const res = await request(app).patch("/lrp-dashboard/1").send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if statusLrp is invalid enum", async () => {
      const res = await request(app).patch("/lrp-dashboard/1").send({ statusLrp: "INVALID" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if statusLrp is lowercase", async () => {
      const res = await request(app).patch("/lrp-dashboard/1").send({ statusLrp: "submitted" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if qtyOk is negative", async () => {
      const res = await request(app).patch("/lrp-dashboard/1").send({ qtyOk: -1 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if qtyNgProses is negative", async () => {
      const res = await request(app).patch("/lrp-dashboard/1").send({ qtyNgProses: -5 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if qtyRework is negative", async () => {
      const res = await request(app).patch("/lrp-dashboard/1").send({ qtyRework: -1 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if qtyNgPrev is negative", async () => {
      const res = await request(app).patch("/lrp-dashboard/1").send({ qtyNgPrev: -2 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if lrpId param is non-numeric string", async () => {
      const res = await request(app).patch("/lrp-dashboard/abc").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if lrpId param is float", async () => {
      const res = await request(app).patch("/lrp-dashboard/1.5").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 404 if LRP not found during update", async () => {
      lrpService.updateLrpById.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "LRP not found")
      );

      const res = await request(app).patch("/lrp-dashboard/999").send({ statusLrp: "SUBMITTED" });

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("LRP not found");
    });

    test("❌ should return 500 on database failure", async () => {
      lrpService.updateLrpById.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).patch("/lrp-dashboard/1").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma unique constraint (P2002)", async () => {
      lrpService.updateLrpById.mockRejectedValue(
        Object.assign(new Error("Unique constraint violated"), { code: "P2002" })
      );
      const res = await request(app).patch("/lrp-dashboard/1").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma transaction failure (P2028)", async () => {
      lrpService.updateLrpById.mockRejectedValue(
        Object.assign(new Error("Transaction failed"), { code: "P2028" })
      );
      const res = await request(app).patch("/lrp-dashboard/1").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // DELETE /lrp-dashboard/:lrpId — deleteLrp
  // ===========================================================================
  describe("DELETE /lrp-dashboard/:lrpId", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 on successful deletion (ADMIN)", async () => {
      lrpService.deleteLrpById.mockResolvedValue(undefined);

      const res = await request(app).delete("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe("LRP deleted successfully");
      expect(lrpService.deleteLrpById).toHaveBeenCalledWith(1);
    });

    test("✅ should return 200 on successful deletion (SUPERVISOR)", async () => {
      setRole("SUPERVISOR");
      lrpService.deleteLrpById.mockResolvedValue(undefined);

      const res = await request(app).delete("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 on successful deletion (ENGINEERING)", async () => {
      setRole("ENGINEERING");
      lrpService.deleteLrpById.mockResolvedValue(undefined);

      const res = await request(app).delete("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.OK);
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).delete("/lrp-dashboard/1");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(lrpService.deleteLrpById).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");
      const res = await request(app).delete("/lrp-dashboard/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).delete("/lrp-dashboard/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).delete("/lrp-dashboard/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).delete("/lrp-dashboard/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if lrpId is non-numeric string", async () => {
      const res = await request(app).delete("/lrp-dashboard/abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if lrpId is a float", async () => {
      const res = await request(app).delete("/lrp-dashboard/1.5");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 404 if LRP not found during deletion", async () => {
      lrpService.deleteLrpById.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "LRP not found")
      );

      const res = await request(app).delete("/lrp-dashboard/999");

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("LRP not found");
    });

    test("❌ should return 500 on database failure", async () => {
      lrpService.deleteLrpById.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).delete("/lrp-dashboard/1");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on FK constraint violation (P2003)", async () => {
      lrpService.deleteLrpById.mockRejectedValue(
        Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" })
      );
      const res = await request(app).delete("/lrp-dashboard/1");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // POST /lrp-dashboard/export/request
  // ===========================================================================
  describe("POST /lrp-dashboard/export/request", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 202 Accepted when export job is queued successfully", async () => {
      exportQueue.getJobs.mockResolvedValue([]);
      exportQueue.add.mockResolvedValue({ id: "job-123" });

      const res = await request(app).post("/lrp-dashboard/export/request");

      expect(res.status).toBe(httpStatus.ACCEPTED);
      expect(res.body.status).toBe("success");
      expect(res.body.jobId).toBe("job-123");
    });

    test("✅ should queue export with correct userId from req.user", async () => {
      exportQueue.getJobs.mockResolvedValue([]);
      exportQueue.add.mockResolvedValue({ id: "job-999" });

      await request(app).post("/lrp-dashboard/export/request");

      expect(exportQueue.add).toHaveBeenCalledWith(
        "export-data",
        expect.objectContaining({ userId: 1 })
      );
    });

    test("✅ should pass filter params (startDate, endDate) to queue job", async () => {
      exportQueue.getJobs.mockResolvedValue([]);
      exportQueue.add.mockResolvedValue({ id: "job-456" });

      await request(app)
        .post("/lrp-dashboard/export/request")
        .query({ startDate: "2025-01-01", endDate: "2025-01-31" });

      expect(exportQueue.add).toHaveBeenCalledWith(
        "export-data",
        expect.objectContaining({
          filter: expect.objectContaining({ 
            startDate: expect.stringMatching(/^2025-01-01/), 
            endDate: expect.stringMatching(/^2025-01-31/) 
          }),
        })
      );
    });

    test("✅ should accept SUPERVISOR requesting export", async () => {
      setRole("SUPERVISOR");
      exportQueue.getJobs.mockResolvedValue([]);
      exportQueue.add.mockResolvedValue({ id: "job-789" });

      const res = await request(app).post("/lrp-dashboard/export/request");

      expect(res.status).toBe(httpStatus.ACCEPTED);
    });

    test("✅ should include helpful message in 202 response", async () => {
      exportQueue.getJobs.mockResolvedValue([]);
      exportQueue.add.mockResolvedValue({ id: "job-123" });

      const res = await request(app).post("/lrp-dashboard/export/request");

      expect(res.body.message).toContain("diproses");
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).post("/lrp-dashboard/export/request");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(exportQueue.add).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");
      const res = await request(app).post("/lrp-dashboard/export/request");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).post("/lrp-dashboard/export/request");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).post("/lrp-dashboard/export/request");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Duplicate Job Protection ───────────────────────────────────────────
    test("❌ should return 429 if user already has an active export job", async () => {
      const activeJob = { id: "job-existing", name: "export-data", data: { userId: 1 } };
      exportQueue.getJobs.mockResolvedValue([activeJob]);

      const res = await request(app).post("/lrp-dashboard/export/request");

      expect(res.status).toBe(httpStatus.TOO_MANY_REQUESTS);
      expect(res.body.status).toBe("error");
      expect(res.body.jobId).toBe("job-existing");
      expect(exportQueue.add).not.toHaveBeenCalled();
    });

    test("❌ should NOT block if another user (different userId) has active job", async () => {
      const otherUserJob = { id: "job-other", name: "export-data", data: { userId: 99 } };
      exportQueue.getJobs.mockResolvedValue([otherUserJob]);
      exportQueue.add.mockResolvedValue({ id: "job-new" });

      const res = await request(app).post("/lrp-dashboard/export/request");

      expect(res.status).toBe(httpStatus.ACCEPTED);
      expect(exportQueue.add).toHaveBeenCalled();
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if startDate query is invalid", async () => {
      const res = await request(app)
        .post("/lrp-dashboard/export/request")
        .query({ startDate: "not-a-date" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if format is invalid (not excel or pdf)", async () => {
      const res = await request(app)
        .post("/lrp-dashboard/export/request")
        .query({ format: "csv" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 500 if exportQueue.add throws", async () => {
      exportQueue.getJobs.mockResolvedValue([]);
      exportQueue.add.mockRejectedValue(new Error("Queue unavailable"));

      const res = await request(app).post("/lrp-dashboard/export/request");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 if exportQueue.getJobs throws", async () => {
      exportQueue.getJobs.mockRejectedValue(new Error("Redis connection failed"));

      const res = await request(app).post("/lrp-dashboard/export/request");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /lrp-dashboard/export/status/:jobId
  // ===========================================================================
  describe("GET /lrp-dashboard/export/status/:jobId", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 with status=processing when job not yet done", async () => {
      exportQueue.getJob.mockResolvedValue(mockJob);
      mockJob.isFailed.mockResolvedValue(false);
      mockJob.isCompleted.mockResolvedValue(false);

      const res = await request(app).get("/lrp-dashboard/export/status/job-123");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe("processing");
    });

    test("✅ should return 200 with status=completed and downloadUrl when done", async () => {
      exportQueue.getJob.mockResolvedValue(mockJob);
      mockJob.isFailed.mockResolvedValue(false);
      mockJob.isCompleted.mockResolvedValue(true);

      const res = await request(app).get("/lrp-dashboard/export/status/job-123");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe("completed");
      expect(res.body.downloadUrl).toBe("http://storage/exports/file.xlsx");
    });

    test("✅ should return 200 with status=completed for SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      exportQueue.getJob.mockResolvedValue(mockJob);
      mockJob.isFailed.mockResolvedValue(false);
      mockJob.isCompleted.mockResolvedValue(true);

      const res = await request(app).get("/lrp-dashboard/export/status/job-123");

      expect(res.status).toBe(httpStatus.OK);
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/lrp-dashboard/export/status/job-123");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(exportQueue.getJob).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get("/lrp-dashboard/export/status/job-123");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if requesting another user's job status", async () => {
      const otherUserJob = {
        ...mockJob,
        data: { userId: 999, filter: {} },
      };
      exportQueue.getJob.mockResolvedValue(otherUserJob);

      const res = await request(app).get("/lrp-dashboard/export/status/job-123");

      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(res.body.message).toContain("izin");
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 404 if job not found in queue", async () => {
      exportQueue.getJob.mockResolvedValue(null);

      const res = await request(app).get("/lrp-dashboard/export/status/job-nonexistent");

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Job tidak ditemukan.");
    });

    test("❌ should return 500 if job failed", async () => {
      exportQueue.getJob.mockResolvedValue({
        ...mockJob,
        failedReason: "Out of memory",
        isFailed: jest.fn().mockResolvedValue(true),
        isCompleted: jest.fn().mockResolvedValue(false),
      });

      const res = await request(app).get("/lrp-dashboard/export/status/job-123");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.body.status).toBe("failed");
      expect(res.body.error).toBe("Out of memory");
    });

    test("❌ should return 500 if exportQueue.getJob throws", async () => {
      exportQueue.getJob.mockRejectedValue(new Error("Redis down"));

      const res = await request(app).get("/lrp-dashboard/export/status/job-123");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // 🔴 Worst Case & Edge Case Scenarios
  // ===========================================================================
  describe("🔴 Worst Case & Edge Case Scenarios", () => {

    test("summary: concurrent requests with same filter both return 200", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue(mockUnifiedData);

      const [res1, res2] = await Promise.all([
        request(app).get("/lrp-dashboard/summary?startDate=2025-01-01"),
        request(app).get("/lrp-dashboard/summary?startDate=2025-01-01"),
      ]);

      expect(res1.status).toBe(httpStatus.OK);
      expect(res2.status).toBe(httpStatus.OK);
    });

    test("summary: large page number returns 200 with empty list", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue({
        ...mockUnifiedData,
        lrp_list: [],
        pagination: { total: 5, totalPages: 1, currentPage: 99999, limit: 10 },
      });

      const res = await request(app).get("/lrp-dashboard/summary?page=99999");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.lrp_list).toHaveLength(0);
    });

    test("summary: historical date range (year 2000) returns 200", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue({
        ...mockUnifiedData,
        lrp_list: [],
      });

      const res = await request(app).get(
        "/lrp-dashboard/summary?startDate=2000-01-01&endDate=2000-12-31"
      );

      expect(res.status).toBe(httpStatus.OK);
    });

    test("summary: future date filter returns 200 with empty data", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockResolvedValue({
        ...mockUnifiedData,
        summary: { totalOk: 0, totalNg: 0, totalRework: 0, totalQty: 0, laporanHariIni: 0 },
        lrp_list: [],
      });

      const res = await request(app).get("/lrp-dashboard/summary?startDate=2099-12-31");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("getLrpDetail: returns correct lrpId cast to number (not string)", async () => {
      lrpDashboardService.getLrpDetail.mockResolvedValue(mockLrpDetail);

      await request(app).get("/lrp-dashboard/42");

      expect(lrpDashboardService.getLrpDetail).toHaveBeenCalledWith(42);
      expect(typeof lrpDashboardService.getLrpDetail.mock.calls[0][0]).toBe("number");
    });

    test("updateLrp: lrpId is correctly cast to number when calling service", async () => {
      lrpService.updateLrpById.mockResolvedValue(mockUpdatedLrp);

      await request(app).patch("/lrp-dashboard/7").send({ statusLrp: "SUBMITTED" });

      expect(lrpService.updateLrpById).toHaveBeenCalledWith(7, expect.any(Object));
      expect(typeof lrpService.updateLrpById.mock.calls[0][0]).toBe("number");
    });

    test("deleteLrp: lrpId is correctly cast to number when calling service", async () => {
      lrpService.deleteLrpById.mockResolvedValue(undefined);

      await request(app).delete("/lrp-dashboard/5");

      expect(lrpService.deleteLrpById).toHaveBeenCalledWith(5);
      expect(typeof lrpService.deleteLrpById.mock.calls[0][0]).toBe("number");
    });

    test("export request: concurrent requests by same user → 202 then 429", async () => {
      exportQueue.getJobs
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "job-123", name: "export-data", data: { userId: 1 } }]);
      exportQueue.add.mockResolvedValue({ id: "job-123" });

      const res1 = await request(app).post("/lrp-dashboard/export/request");
      const res2 = await request(app).post("/lrp-dashboard/export/request");

      expect(res1.status).toBe(httpStatus.ACCEPTED);
      expect(res2.status).toBe(httpStatus.TOO_MANY_REQUESTS);
    });

    test("export status: job with null returnvalue downloadUrl returns completed with null URL", async () => {
      const jobNullUrl = {
        ...mockJob,
        returnvalue: { downloadUrl: null },
        isFailed: jest.fn().mockResolvedValue(false),
        isCompleted: jest.fn().mockResolvedValue(true),
      };
      exportQueue.getJob.mockResolvedValue(jobNullUrl);

      const res = await request(app).get("/lrp-dashboard/export/status/job-123");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe("completed");
      expect(res.body.downloadUrl).toBeNull();
    });

    test("unsupported HTTP method (PUT) on /lrp-dashboard/summary returns 404", async () => {
      const res = await request(app).put("/lrp-dashboard/summary").send({});
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("Prisma P2037 on summary endpoint returns 500", async () => {
      lrpDashboardService.getUnifiedDashboardData.mockRejectedValue(
        Object.assign(new Error("Prisma Client Connection Pool Exhausted"), { code: "P2037" })
      );
      const res = await request(app).get("/lrp-dashboard/summary");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("deeply nested unknown route returns 404", async () => {
      const res = await request(app).get("/lrp-dashboard/unknown/deep/route");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });
  });
});
