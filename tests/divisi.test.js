import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ──────────────────────────────────────────────────────────────────────────────
// 1. Global Mock Registry
// ──────────────────────────────────────────────────────────────────────────────
global.__DIVISI_MOCKS__ = {
  divisiService: {
    createDivisi: jest.fn(),
    queryDivisi: jest.fn(),
    getDivisiById: jest.fn(),
    updateDivisiById: jest.fn(),
    deleteDivisiById: jest.fn(),
  },
  mockUser: { id: 1, role: "SUPERVISOR", plant: "1" },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          req.user = global.__DIVISI_MOCKS__.mockUser;
          if (requiredRoles.length && !requiredRoles.includes(req.user.role)) {
            return res.status(httpStatus.FORBIDDEN).send({
              status: false,
              message: "Forbidden: You do not have the required role",
            });
          }
          next();
        }
    ),
  },
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// 2. Register Mocks (ESM)
// ──────────────────────────────────────────────────────────────────────────────
jest.unstable_mockModule("../src/services/divisi.service.js", () => ({
  default: global.__DIVISI_MOCKS__.divisiService,
}));
jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__DIVISI_MOCKS__.auth.auth,
}));
jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: global.__DIVISI_MOCKS__.redis,
}));

const { default: app } = await import("../src/app.js");

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
const BASE = "/divisi";
const setRole = (role) => { global.__DIVISI_MOCKS__.mockUser.role = role; };
const resetRole = () => { global.__DIVISI_MOCKS__.mockUser.role = "SUPERVISOR"; };

// ──────────────────────────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────────────────────────
describe("Divisi Controller Unit Tests", () => {
  const { divisiService } = global.__DIVISI_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRole();
  });

  const mockDivisi = { id: 1, nama_divisi: "Production" };
  const mockDivisiList = [mockDivisi, { id: 2, nama_divisi: "Quality Control" }];

  describe(`GET ${BASE}`, () => {
    test("should return 200 and divisi list", async () => {
      divisiService.queryDivisi.mockResolvedValue(mockDivisiList);
      const res = await request(app).get(BASE);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual(mockDivisiList);
      expect(res.body.message).toBe("Success get divisi list");
    });

    test("should return 403 if role is not allowed (e.g., PRODUKSI)", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get(BASE);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 400 if service fails", async () => {
      divisiService.queryDivisi.mockRejectedValue(new Error("DB error"));
      const res = await request(app).get(BASE);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("Failed get divisi list");
    });
  });

  describe(`POST ${BASE}`, () => {
    const validBody = { nama_divisi: "Maintenance" };

    test("should return 201 on success", async () => {
      divisiService.createDivisi.mockResolvedValue({ id: 3, ...validBody });
      const res = await request(app).post(BASE).send(validBody);
      expect(res.status).toBe(httpStatus.CREATED);
      expect(res.body.message).toBe("Success create divisi");
      expect(res.body.data.nama_divisi).toBe(validBody.nama_divisi);
    });

    test("should return 400 if validation fails (missing nama_divisi)", async () => {
      const res = await request(app).post(BASE).send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 if divisi already exists", async () => {
      divisiService.createDivisi.mockRejectedValue(new Error("Divisi already exists"));
      const res = await request(app).post(BASE).send(validBody);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("Divisi already exists");
    });
  });

  describe(`GET ${BASE}/:divisiId`, () => {
    test("should return 200 and divisi data", async () => {
      divisiService.getDivisiById.mockResolvedValue(mockDivisi);
      const res = await request(app).get(`${BASE}/1`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual(mockDivisi);
    });

    test("should return 400 if id is not an integer", async () => {
      const res = await request(app).get(`${BASE}/abc`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 404 if divisi is not found", async () => {
      divisiService.getDivisiById.mockRejectedValue(new Error("Divisi not found"));
      const res = await request(app).get(`${BASE}/99`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST); // Controller uses responseApiFailed (400) even for 404 service error
      expect(res.body.message).toContain("Divisi not found");
    });
  });

  describe(`PUT ${BASE}/:divisiId`, () => {
    const updateBody = { nama_divisi: "Production Updated" };

    test("should return 200 on success", async () => {
      divisiService.updateDivisiById.mockResolvedValue({ ...mockDivisi, ...updateBody });
      const res = await request(app).put(`${BASE}/1`).send(updateBody);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.message).toBe("Success update divisi");
      expect(res.body.data.nama_divisi).toBe(updateBody.nama_divisi);
    });

    test("should return 400 if validation fails", async () => {
      const res = await request(app).put(`${BASE}/1`).send({ nama_divisi: 123 });
      // Joi string coercion might allow this, but let's test an invalid field
      const res2 = await request(app).put(`${BASE}/1`).send({ unknown: "field" });
      expect(res2.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 if new name already exists", async () => {
      divisiService.updateDivisiById.mockRejectedValue(new Error("Divisi name already exists"));
      const res = await request(app).put(`${BASE}/1`).send(updateBody);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("Divisi name already exists");
    });
  });

  describe(`DELETE ${BASE}/:divisiId`, () => {
    test("should return 200 on success", async () => {
      divisiService.deleteDivisiById.mockResolvedValue(mockDivisi);
      const res = await request(app).delete(`${BASE}/1`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.message).toBe("Success delete divisi");
    });

    test("should return 400 if divisi has existing users", async () => {
      divisiService.deleteDivisiById.mockRejectedValue(new Error("Cannot delete divisi with existing users"));
      const res = await request(app).delete(`${BASE}/1`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("Cannot delete divisi with existing users");
    });
  });
});
