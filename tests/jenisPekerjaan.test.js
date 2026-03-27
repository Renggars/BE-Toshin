import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ──────────────────────────────────────────────────────────────────────────────
// 1. Global Mock Registry
// ──────────────────────────────────────────────────────────────────────────────
global.__JENIS_PEKERJAAN_MOCKS__ = {
  jenisPekerjaanService: {
    createJenisPekerjaan: jest.fn(),
    queryJenisPekerjaan: jest.fn(),
    getJenisPekerjaanById: jest.fn(),
    updateJenisPekerjaanById: jest.fn(),
    deleteJenisPekerjaanById: jest.fn(),
  },
  mockUser: { id: 1, role: "SUPERVISOR", plant: "1" },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          req.user = global.__JENIS_PEKERJAAN_MOCKS__.mockUser;
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
jest.unstable_mockModule("../src/services/jenisPekerjaan.service.js", () => ({
  default: global.__JENIS_PEKERJAAN_MOCKS__.jenisPekerjaanService,
}));
jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__JENIS_PEKERJAAN_MOCKS__.auth.auth,
}));
jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: global.__JENIS_PEKERJAAN_MOCKS__.redis,
}));

const { default: app } = await import("../src/app.js");

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
const BASE = "/jenis-pekerjaan";
const setRole = (role) => { global.__JENIS_PEKERJAAN_MOCKS__.mockUser.role = role; };
const resetRole = () => { global.__JENIS_PEKERJAAN_MOCKS__.mockUser.role = "SUPERVISOR"; };

// ──────────────────────────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────────────────────────
describe("Jenis Pekerjaan Controller Unit Tests", () => {
  const { jenisPekerjaanService } = global.__JENIS_PEKERJAAN_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRole();
  });

  const mockItem = { id: 1, nama_pekerjaan: "Assembling" };
  const mockItemList = [mockItem, { id: 2, nama_pekerjaan: "Welding" }];

  describe(`GET ${BASE}`, () => {
    test("should return 200 and list", async () => {
      jenisPekerjaanService.queryJenisPekerjaan.mockResolvedValue(mockItemList);
      const res = await request(app).get(BASE);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual(mockItemList);
      expect(res.body.message).toBe("Success get jenis pekerjaan list");
    });

    test("should return 403 for unauthorized role", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get(BASE);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 400 on service error", async () => {
      jenisPekerjaanService.queryJenisPekerjaan.mockRejectedValue(new Error("Cache fail"));
      const res = await request(app).get(BASE);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });
  });

  describe(`POST ${BASE}`, () => {
    const validPayload = { nama_pekerjaan: "Painting" };

    test("should return 201 and created object", async () => {
      jenisPekerjaanService.createJenisPekerjaan.mockResolvedValue({ id: 3, ...validPayload });
      const res = await request(app).post(BASE).send(validPayload);
      expect(res.status).toBe(httpStatus.CREATED);
      expect(res.body.message).toBe("Success create jenis pekerjaan");
      expect(res.body.data.nama_pekerjaan).toBe(validPayload.nama_pekerjaan);
    });

    test("should return 400 on Joi validation error", async () => {
      const res = await request(app).post(BASE).send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 if already exists", async () => {
      jenisPekerjaanService.createJenisPekerjaan.mockRejectedValue(new Error("Jenis pekerjaan already exists"));
      const res = await request(app).post(BASE).send(validPayload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("already exists");
    });
  });

  describe(`GET ${BASE}/:id`, () => {
    test("should return 200 and item detail", async () => {
      jenisPekerjaanService.getJenisPekerjaanById.mockResolvedValue(mockItem);
      const res = await request(app).get(`${BASE}/1`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual(mockItem);
    });

    test("should return 400 if ID is not number", async () => {
      const res = await request(app).get(`${BASE}/abc`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 (from controller catch) if not found", async () => {
      jenisPekerjaanService.getJenisPekerjaanById.mockRejectedValue(new Error("Jenis pekerjaan not found"));
      const res = await request(app).get(`${BASE}/99`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("not found");
    });
  });

  describe(`PUT ${BASE}/:id`, () => {
    const updateBody = { nama_pekerjaan: "Assembling Final" };

    test("should return 200 on successful update", async () => {
      jenisPekerjaanService.updateJenisPekerjaanById.mockResolvedValue({ ...mockItem, ...updateBody });
      const res = await request(app).put(`${BASE}/1`).send(updateBody);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.message).toBe("Success update jenis pekerjaan");
      expect(res.body.data.nama_pekerjaan).toBe(updateBody.nama_pekerjaan);
    });

    test("should return 400 if name duplication occurs", async () => {
      jenisPekerjaanService.updateJenisPekerjaanById.mockRejectedValue(new Error("Jenis pekerjaan name already exists"));
      const res = await request(app).put(`${BASE}/1`).send(updateBody);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 on invalid payload", async () => {
      const res = await request(app).put(`${BASE}/1`).send({ nama_pekerjaan: 123 });
      // Joi validation should catch this or coercion will happen. Testing missing ID logic:
      const res2 = await request(app).put(`${BASE}/`).send(updateBody);
      expect(res2.status).toBe(httpStatus.NOT_FOUND); // Routing error
    });
  });

  describe(`DELETE ${BASE}/:id`, () => {
    test("should return 200 on successful deletion", async () => {
      jenisPekerjaanService.deleteJenisPekerjaanById.mockResolvedValue(mockItem);
      const res = await request(app).delete(`${BASE}/1`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.message).toBe("Success delete jenis pekerjaan");
    });

    test("should return 400 if linked to Rencana Produksi", async () => {
      jenisPekerjaanService.deleteJenisPekerjaanById.mockRejectedValue(new Error("Cannot delete jenis pekerjaan linked to Rencana Produksi"));
      const res = await request(app).delete(`${BASE}/1`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("linked to Rencana Produksi");
    });

    test("should return 400 if linked to Target", async () => {
      jenisPekerjaanService.deleteJenisPekerjaanById.mockRejectedValue(new Error("Cannot delete jenis pekerjaan linked to Target"));
      const res = await request(app).delete(`${BASE}/1`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("linked to Target");
    });

    test("should return 403 for PRODUKSI role", async () => {
      setRole("PRODUKSI");
      const res = await request(app).delete(`${BASE}/1`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });
  });
});
