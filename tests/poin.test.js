import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// 1. Global Mock Registry
global.__POIN_MOCKS__ = {
  poinService: {
    getUserCurrentPoin: jest.fn(),
    createPelanggaran: jest.fn(),
    getPoinDashboardStats: jest.fn(),
    getPoinRankings: jest.fn(),
    getPoinHistory: jest.fn(),
    getFormData: jest.fn(),
    getWeeklyStats: jest.fn(),
    getMonthlyStats: jest.fn(),
    getUserByNfc: jest.fn(),
  },
  mockUser: { id: 1, role: "SUPERVISOR", plant: "1" },
  auth: {
    auth: jest.fn((...requiredRoles) => (req, res, next) => {
      // Use role from global mockUser
      req.user = global.__POIN_MOCKS__.mockUser;
      
      if (requiredRoles.length && !requiredRoles.includes(req.user.role)) {
        return res.status(httpStatus.FORBIDDEN).send({ 
          status: false, 
          message: "Forbidden: You do not have the required role" 
        });
      }
      next();
    }),
    authOptional: jest.fn(() => (req, res, next) => {
      req.user = global.__POIN_MOCKS__.mockUser;
      next();
    }),
  },
  redis: {
    delByPattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  }
};

// 2. Register Mocks (ESM)
jest.unstable_mockModule("../src/services/poin.service.js", () => ({ default: global.__POIN_MOCKS__.poinService }));
jest.unstable_mockModule("../src/middlewares/auth.js", () => ({ 
  auth: global.__POIN_MOCKS__.auth.auth,
  authOptional: global.__POIN_MOCKS__.auth.authOptional 
}));
jest.unstable_mockModule("../src/utils/redis.js", () => ({ default: global.__POIN_MOCKS__.redis }));

const { default: app } = await import("../src/app.js");

const { default: ApiError } = await import("../src/utils/ApiError.js");

describe("Poin Controller Unit Tests", () => {
  const { poinService, auth } = global.__POIN_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /poin/my-poin", () => {
    test("should return user current points", async () => {
      poinService.getUserCurrentPoin.mockResolvedValue(100);

      const res = await request(app).get("/poin/my-poin");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body).toEqual({ status: true, total_poin: 100 });
    });

    test("should return 500 if service fails", async () => {
      poinService.getUserCurrentPoin.mockRejectedValue(new Error("Database error"));
      const res = await request(app).get("/poin/my-poin");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /poin/", () => {
    const payload = {
      operatorId: 2,
      tipeDisiplinId: 1,
      shiftId: 1,
      keterangan: "Tes unit test",
    };

    test("should create violation successfully", async () => {
      poinService.createPelanggaran.mockResolvedValue({
        fk_id_operator: 2,
        operator: { nama: "Operator Tes" },
      });
      poinService.getUserCurrentPoin.mockResolvedValue(90);

      const res = await request(app).post("/poin/").send(payload);
      expect(res.status).toBe(httpStatus.CREATED);
      expect(res.body.operator.nama).toBe("Operator Tes");
    });

    test("should return 404 if operator not found", async () => {
      poinService.createPelanggaran.mockRejectedValue(new ApiError(httpStatus.NOT_FOUND, "Operator tidak ditemukan"));
      const res = await request(app).post("/poin/").send(payload);
      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Operator tidak ditemukan");
    });

    test("should return 400 for business logic violation (e.g. suspended)", async () => {
      poinService.createPelanggaran.mockRejectedValue(new ApiError(httpStatus.BAD_REQUEST, "Operator sedang dalam masa suspend"));
      const res = await request(app).post("/poin/").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toBe("Operator sedang dalam masa suspend");
    });

    test("should return 403 Forbidden if user is PRODUKSI (RBAC)", async () => {
      // Set roles to PRODUKSI to test RBAC
      global.__POIN_MOCKS__.mockUser.role = "PRODUKSI";
      const res = await request(app).post("/poin/").send(payload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(res.body.message).toMatch(/Forbidden/);
      // Reset back to SUPERVISOR for other tests
      global.__POIN_MOCKS__.mockUser.role = "SUPERVISOR";
    });

    test("should return 400 if required fields are missing (Joi Validation)", async () => {
      const invalidPayload = { operatorId: 2 }; // Missing tipeDisiplinId and shiftId
      const res = await request(app).post("/poin/").send(invalidPayload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/required/);
    });
  });

  describe("GET /poin/dashboard/stats", () => {
    test("should return dashboard stats", async () => {
      const mockStats = { total_pelanggaran: 5 };
      poinService.getPoinDashboardStats.mockResolvedValue(mockStats);

      const res = await request(app).get("/poin/dashboard/stats?plant=1");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual(mockStats);
    });

    test("should handle missing query mapping gracefully", async () => {
      poinService.getPoinDashboardStats.mockResolvedValue({});
      const res = await request(app).get("/poin/dashboard/stats");
      expect(res.status).toBe(httpStatus.OK);
    });
  });

  describe("GET /poin/user/:userId", () => {
    test("should return points for specific user", async () => {
      poinService.getUserCurrentPoin.mockResolvedValue(85);
      const res = await request(app).get("/poin/user/2");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data?.total_poin ?? res.body.total_poin).toBe(85);
    });

    test("should return 404 for non-existent user", async () => {
      poinService.getUserCurrentPoin.mockRejectedValue(new ApiError(httpStatus.NOT_FOUND, "User not found"));
      const res = await request(app).get("/poin/user/999");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });
  });

  describe("GET /poin/user/by-nfc/:uid_nfc", () => {
    test("should return user by NFC UID", async () => {
      const mockUser = { id: 2, nama: "Operator NFC" };
      poinService.getUserByNfc.mockResolvedValue(mockUser);
      const res = await request(app).get("/poin/user/by-nfc/ABC123");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual(mockUser);
    });

    test("should return 404 if NFC not found", async () => {
      poinService.getUserByNfc.mockRejectedValue(new ApiError(httpStatus.NOT_FOUND, "NFC tidak ditemukan"));
      const res = await request(app).get("/poin/user/by-nfc/UNKNOWN");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });
  });

  describe("GET /poin/dashboard/weekly-stats", () => {
    test("should return weekly stats", async () => {
      const mockStats = { days: [], values: [] };
      poinService.getWeeklyStats.mockResolvedValue(mockStats);

      const res = await request(app).get("/poin/dashboard/weekly-stats?plant=1");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.days).toEqual([]);
    });
  });

  describe("GET /poin/dashboard/monthly-stats", () => {
    test("should return monthly stats", async () => {
      const mockStats = { labels: [], values: [] };
      poinService.getMonthlyStats.mockResolvedValue(mockStats);

      const res = await request(app).get("/poin/dashboard/monthly-stats?plant=1");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.labels).toEqual([]);
    });
  });

  describe("GET /poin/dashboard/rankings", () => {
    test("should return rankings", async () => {
      const mockRankings = [];
      poinService.getPoinRankings.mockResolvedValue(mockRankings);

      const res = await request(app).get("/poin/dashboard/rankings?plant=1");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual(mockRankings);
    });
  });
});
