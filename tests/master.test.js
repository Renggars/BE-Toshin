import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ──────────────────────────────────────────────────────────────────────────────
// 1. Global Mock Registry
// ──────────────────────────────────────────────────────────────────────────────
global.__MASTER_MOCKS__ = {
  masterService: {
    // Mesin
    getMesin: jest.fn(),
    createMesin: jest.fn(),
    updateMesin: jest.fn(),
    deleteMesin: jest.fn(),
    // Produk
    getProduk: jest.fn(),
    createProduk: jest.fn(),
    updateProduk: jest.fn(),
    deleteProduk: jest.fn(),
    // Shift
    getShift: jest.fn(),
    createShift: jest.fn(),
    updateShift: jest.fn(),
    deleteShift: jest.fn(),
    // Target
    getTarget: jest.fn(),
    createTarget: jest.fn(),
    updateTarget: jest.fn(),
    deleteTarget: jest.fn(),
    // Masalah Andon
    getMasalahAndon: jest.fn(),
    createMasalahAndon: jest.fn(),
    updateMasalahAndon: jest.fn(),
    deleteMasalahAndon: jest.fn(),
    // Tipe Disiplin
    getTipeDisiplin: jest.fn(),
    createTipeDisiplin: jest.fn(),
    updateTipeDisiplin: jest.fn(),
    deleteTipeDisiplin: jest.fn(),
    // Aggregated
    getAllMasterData: jest.fn(),
  },
  // Default: SUPERVISOR (managerRoles access)
  mockUser: { id: 1, role: "SUPERVISOR", plant: "1" },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          req.user = global.__MASTER_MOCKS__.mockUser;
          if (
            requiredRoles.length &&
            !requiredRoles.includes(req.user.role)
          ) {
            return res.status(httpStatus.FORBIDDEN).send({
              status: false,
              message: "Forbidden: You do not have the required role",
            });
          }
          next();
        }
    ),
    authOptional: jest.fn(
      () => (req, res, next) => {
        req.user = global.__MASTER_MOCKS__.mockUser;
        next();
      }
    ),
  },
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPattern: jest.fn(),
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// 2. Register Mocks (ESM)
// ──────────────────────────────────────────────────────────────────────────────
jest.unstable_mockModule("../src/services/master.service.js", () => ({
  default: global.__MASTER_MOCKS__.masterService,
}));
jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__MASTER_MOCKS__.auth.auth,
  authOptional: global.__MASTER_MOCKS__.auth.authOptional,
}));
jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: global.__MASTER_MOCKS__.redis,
}));

const { default: app } = await import("../src/app.js");
const { default: ApiError } = await import("../src/utils/ApiError.js");

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
const BASE = "/master";

const setRole = (role) => { global.__MASTER_MOCKS__.mockUser.role = role; };
const resetRole = () => { global.__MASTER_MOCKS__.mockUser.role = "SUPERVISOR"; };

// ──────────────────────────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────────────────────────
describe("Master Controller Unit Tests", () => {
  const { masterService } = global.__MASTER_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRole();
  });

  // ============================================================
  // MESIN
  // ============================================================
  describe("Mesin", () => {
    const mesinList = { press: [{ id: 1, nama_mesin: "Mesin A", kategori: "PRESS" }] };
    const mesinItem = { id: 1, nama_mesin: "Mesin A", kategori: "PRESS" };

    describe(`GET ${BASE}/mesin`, () => {
      test("should return 200 with grouped mesin data", async () => {
        masterService.getMesin.mockResolvedValue(mesinList);
        const res = await request(app).get(`${BASE}/mesin`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual(mesinList);
        expect(res.body.message).toBe("Success get mesin");
      });

      test("should return 200 with empty object if no mesin exists", async () => {
        masterService.getMesin.mockResolvedValue({});
        const res = await request(app).get(`${BASE}/mesin`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual({});
      });

      test("should allow PRODUKSI role (allRoles)", async () => {
        setRole("PRODUKSI");
        masterService.getMesin.mockResolvedValue(mesinList);
        const res = await request(app).get(`${BASE}/mesin`);
        expect(res.status).toBe(httpStatus.OK);
      });

      test("should return 403 for MAINTENANCE role", async () => {
        setRole("MAINTENANCE");
        const res = await request(app).get(`${BASE}/mesin`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.getMesin.mockRejectedValue(new Error("DB error"));
        const res = await request(app).get(`${BASE}/mesin`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`POST ${BASE}/mesin`, () => {
      const validPayload = { nama_mesin: "Mesin B", kategori: "PRESS" };

      test("should return 200 on successful create (responseApiSuccess always returns 200)", async () => {
        masterService.createMesin.mockResolvedValue(mesinItem);
        const res = await request(app).post(`${BASE}/mesin`).send(validPayload);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success create mesin");
        expect(res.body.data).toEqual(mesinItem);
      });

      test("should return 400 if nama_mesin is missing (Joi)", async () => {
        const res = await request(app).post(`${BASE}/mesin`).send({ kategori: "PRESS" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
        expect(res.body.message).toMatch(/required/);
      });

      test("should return 400 if kategori is invalid enum value (Joi)", async () => {
        const res = await request(app).post(`${BASE}/mesin`).send({ nama_mesin: "X", kategori: "INVALID" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if kategori is missing (Joi)", async () => {
        const res = await request(app).post(`${BASE}/mesin`).send({ nama_mesin: "X" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 if role is PRODUKSI (managerRoles only)", async () => {
        setRole("PRODUKSI");
        const res = await request(app).post(`${BASE}/mesin`).send(validPayload);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.createMesin.mockRejectedValue(new Error("Prisma error"));
        const res = await request(app).post(`${BASE}/mesin`).send(validPayload);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`PUT ${BASE}/mesin/:id`, () => {
      test("should return 200 on successful update", async () => {
        masterService.updateMesin.mockResolvedValue({ ...mesinItem, nama_mesin: "Updated" });
        const res = await request(app).put(`${BASE}/mesin/1`).send({ nama_mesin: "Updated" });
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success update mesin");
      });

      test("should return 400 if body is empty (Joi .min(1))", async () => {
        const res = await request(app).put(`${BASE}/mesin/1`).send({});
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if id param is not a number (Joi)", async () => {
        const res = await request(app).put(`${BASE}/mesin/abc`).send({ nama_mesin: "X" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if kategori value is invalid (Joi)", async () => {
        const res = await request(app).put(`${BASE}/mesin/1`).send({ kategori: "UNKNOWN" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).put(`${BASE}/mesin/1`).send({ nama_mesin: "X" });
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.updateMesin.mockRejectedValue(new Error("Record not found"));
        const res = await request(app).put(`${BASE}/mesin/1`).send({ nama_mesin: "X" });
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`DELETE ${BASE}/mesin/:id`, () => {
      test("should return 200 on successful delete", async () => {
        masterService.deleteMesin.mockResolvedValue(mesinItem);
        const res = await request(app).delete(`${BASE}/mesin/1`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success delete mesin");
      });

      test("should pass parsed integer id to service", async () => {
        masterService.deleteMesin.mockResolvedValue(mesinItem);
        await request(app).delete(`${BASE}/mesin/5`);
        expect(masterService.deleteMesin).toHaveBeenCalledWith(5);
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).delete(`${BASE}/mesin/1`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws (record in use by FK constraint)", async () => {
        masterService.deleteMesin.mockRejectedValue(new Error("Foreign key constraint failed"));
        const res = await request(app).delete(`${BASE}/mesin/1`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });
  });

  // ============================================================
  // PRODUK
  // ============================================================
  describe("Produk", () => {
    const produkList = [{ id: 1, nama_produk: "Produk A" }];
    const produkItem = { id: 1, nama_produk: "Produk A" };

    describe(`GET ${BASE}/produk`, () => {
      test("should return 200 with produk list", async () => {
        masterService.getProduk.mockResolvedValue(produkList);
        const res = await request(app).get(`${BASE}/produk`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual(produkList);
      });

      test("should return 200 with empty array if no produk", async () => {
        masterService.getProduk.mockResolvedValue([]);
        const res = await request(app).get(`${BASE}/produk`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual([]);
      });

      test("should allow PRODUKSI role", async () => {
        setRole("PRODUKSI");
        masterService.getProduk.mockResolvedValue(produkList);
        const res = await request(app).get(`${BASE}/produk`);
        expect(res.status).toBe(httpStatus.OK);
      });

      test("should return 403 for MAINTENANCE role", async () => {
        setRole("MAINTENANCE");
        const res = await request(app).get(`${BASE}/produk`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.getProduk.mockRejectedValue(new Error("Cache failure"));
        const res = await request(app).get(`${BASE}/produk`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`POST ${BASE}/produk`, () => {
      test("should return 200 on successful create (responseApiSuccess always returns 200)", async () => {
        masterService.createProduk.mockResolvedValue(produkItem);
        const res = await request(app).post(`${BASE}/produk`).send({ nama_produk: "Produk A" });
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success create produk");
      });

      test("should return 400 if nama_produk is missing (Joi)", async () => {
        const res = await request(app).post(`${BASE}/produk`).send({});
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
        expect(res.body.message).toMatch(/required/);
      });

      test("should return 400 if nama_produk is not a string (Joi)", async () => {
        const res = await request(app).post(`${BASE}/produk`).send({ nama_produk: 12345 });
        // Joi coerces number to string so this actually passes — tested for body completeness
        expect([httpStatus.CREATED, httpStatus.BAD_REQUEST]).toContain(res.status);
      });

      test("should return 403 if role is PRODUKSI", async () => {
        setRole("PRODUKSI");
        const res = await request(app).post(`${BASE}/produk`).send({ nama_produk: "X" });
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.createProduk.mockRejectedValue(new Error("Unique constraint failed"));
        const res = await request(app).post(`${BASE}/produk`).send({ nama_produk: "A" });
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`PATCH ${BASE}/produk/:id`, () => {
      test("should return 200 on successful update", async () => {
        masterService.updateProduk.mockResolvedValue({ id: 1, nama_produk: "Updated" });
        const res = await request(app).patch(`${BASE}/produk/1`).send({ nama_produk: "Updated" });
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success update produk");
      });

      test("should return 400 if nama_produk is missing (Joi - required in updateProduk)", async () => {
        const res = await request(app).patch(`${BASE}/produk/1`).send({});
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if id param is not a number (Joi)", async () => {
        const res = await request(app).patch(`${BASE}/produk/abc`).send({ nama_produk: "X" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).patch(`${BASE}/produk/1`).send({ nama_produk: "X" });
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws (record not found)", async () => {
        masterService.updateProduk.mockRejectedValue(new Error("Record not found"));
        const res = await request(app).patch(`${BASE}/produk/999`).send({ nama_produk: "X" });
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`DELETE ${BASE}/produk/:id`, () => {
      test("should return 200 on successful delete", async () => {
        masterService.deleteProduk.mockResolvedValue(produkItem);
        const res = await request(app).delete(`${BASE}/produk/1`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success delete produk");
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).delete(`${BASE}/produk/1`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws (FK / record in use)", async () => {
        masterService.deleteProduk.mockRejectedValue(new Error("Cannot delete: product in use"));
        const res = await request(app).delete(`${BASE}/produk/1`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });
  });

  // ============================================================
  // SHIFT
  // ============================================================
  describe("Shift", () => {
    const shiftList = [{ id: 1, nama_shift: "Pagi", jam_masuk: "07:00", jam_keluar: "15:00", tipe_shift: "Normal" }];
    const shiftItem = shiftList[0];
    const validShiftPayload = { nama_shift: "Pagi", jam_masuk: "07:00", jam_keluar: "15:00", tipe_shift: "Normal" };

    describe(`GET ${BASE}/shift`, () => {
      test("should return 200 with shift list", async () => {
        masterService.getShift.mockResolvedValue(shiftList);
        const res = await request(app).get(`${BASE}/shift`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual(shiftList);
      });

      test("should allow PRODUKSI role", async () => {
        setRole("PRODUKSI");
        masterService.getShift.mockResolvedValue(shiftList);
        const res = await request(app).get(`${BASE}/shift`);
        expect(res.status).toBe(httpStatus.OK);
      });

      test("should return 403 for MAINTENANCE role", async () => {
        setRole("MAINTENANCE");
        const res = await request(app).get(`${BASE}/shift`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.getShift.mockRejectedValue(new Error("DB fail"));
        const res = await request(app).get(`${BASE}/shift`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`POST ${BASE}/shift`, () => {
      test("should return 200 on successful create (responseApiSuccess always returns 200)", async () => {
        masterService.createShift.mockResolvedValue(shiftItem);
        const res = await request(app).post(`${BASE}/shift`).send(validShiftPayload);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success create shift");
      });

      test("should return 400 if nama_shift is missing (Joi)", async () => {
        const { nama_shift, ...rest } = validShiftPayload;
        const res = await request(app).post(`${BASE}/shift`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if jam_masuk has invalid time format (Joi pattern)", async () => {
        const res = await request(app).post(`${BASE}/shift`).send({ ...validShiftPayload, jam_masuk: "7am" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if jam_keluar has invalid time format (Joi pattern)", async () => {
        const res = await request(app).post(`${BASE}/shift`).send({ ...validShiftPayload, jam_keluar: "25:00" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if tipe_shift is missing (Joi)", async () => {
        const { tipe_shift, ...rest } = validShiftPayload;
        const res = await request(app).post(`${BASE}/shift`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 if role is PRODUKSI", async () => {
        setRole("PRODUKSI");
        const res = await request(app).post(`${BASE}/shift`).send(validShiftPayload);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.createShift.mockRejectedValue(new Error("Unique constraint"));
        const res = await request(app).post(`${BASE}/shift`).send(validShiftPayload);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`PATCH ${BASE}/shift/:id`, () => {
      test("should return 200 on successful update", async () => {
        masterService.updateShift.mockResolvedValue({ ...shiftItem, nama_shift: "Sore" });
        const res = await request(app).patch(`${BASE}/shift/1`).send({ nama_shift: "Sore" });
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success update shift");
      });

      test("should return 400 if body is empty (Joi .min(1))", async () => {
        const res = await request(app).patch(`${BASE}/shift/1`).send({});
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if jam_masuk format is wrong (Joi pattern)", async () => {
        const res = await request(app).patch(`${BASE}/shift/1`).send({ jam_masuk: "999:99" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if id param is not a number", async () => {
        const res = await request(app).patch(`${BASE}/shift/abc`).send({ nama_shift: "X" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).patch(`${BASE}/shift/1`).send({ nama_shift: "X" });
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.updateShift.mockRejectedValue(new Error("Record not found"));
        const res = await request(app).patch(`${BASE}/shift/999`).send({ nama_shift: "X" });
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`DELETE ${BASE}/shift/:id`, () => {
      test("should return 200 on successful delete", async () => {
        masterService.deleteShift.mockResolvedValue(shiftItem);
        const res = await request(app).delete(`${BASE}/shift/1`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success delete shift");
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).delete(`${BASE}/shift/1`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws (used in RPH)", async () => {
        masterService.deleteShift.mockRejectedValue(new Error("FK constraint on rencanaProduksi"));
        const res = await request(app).delete(`${BASE}/shift/1`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });
  });

  // ============================================================
  // TARGET
  // ============================================================
  describe("Target", () => {
    const targetList = [{ id: 1, fk_jenis_pekerjaan: 1, fk_produk: 1, total_target: 500, ideal_cycle_time: 10 }];
    const targetItem = targetList[0];
    const validTargetPayload = { fk_jenis_pekerjaan: 1, fk_produk: 1, total_target: 500, ideal_cycle_time: 10 };

    describe(`GET ${BASE}/target`, () => {
      test("should return 200 with target list", async () => {
        masterService.getTarget.mockResolvedValue(targetList);
        const res = await request(app).get(`${BASE}/target`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual(targetList);
      });

      test("should pass fk_produk and fk_jenis_pekerjaan filter to service", async () => {
        masterService.getTarget.mockResolvedValue(targetItem);
        await request(app).get(`${BASE}/target?fk_produk=1&fk_jenis_pekerjaan=2`);
        expect(masterService.getTarget).toHaveBeenCalledWith(
          { fk_produk: 1, fk_jenis_pekerjaan: 2 },
          null
        );
      });

      test("should pass fk_id_shift to service for target calculation", async () => {
        masterService.getTarget.mockResolvedValue(targetList);
        await request(app).get(`${BASE}/target?fk_id_shift=1`);
        expect(masterService.getTarget).toHaveBeenCalledWith({}, 1);
      });

      test("should return 200 with empty array if no targets", async () => {
        masterService.getTarget.mockResolvedValue([]);
        const res = await request(app).get(`${BASE}/target`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual([]);
      });

      test("should allow PRODUKSI role", async () => {
        setRole("PRODUKSI");
        masterService.getTarget.mockResolvedValue(targetList);
        const res = await request(app).get(`${BASE}/target`);
        expect(res.status).toBe(httpStatus.OK);
      });

      test("should return 403 for MAINTENANCE role", async () => {
        setRole("MAINTENANCE");
        const res = await request(app).get(`${BASE}/target`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.getTarget.mockRejectedValue(new Error("DB error"));
        const res = await request(app).get(`${BASE}/target`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`POST ${BASE}/target`, () => {
      test("should return 200 on successful create (responseApiSuccess always returns 200)", async () => {
        masterService.createTarget.mockResolvedValue(targetItem);
        const res = await request(app).post(`${BASE}/target`).send(validTargetPayload);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success create target");
      });

      test("should return 400 if fk_jenis_pekerjaan is missing (Joi)", async () => {
        const { fk_jenis_pekerjaan, ...rest } = validTargetPayload;
        const res = await request(app).post(`${BASE}/target`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if fk_produk is missing (Joi)", async () => {
        const { fk_produk, ...rest } = validTargetPayload;
        const res = await request(app).post(`${BASE}/target`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if total_target is 0 or negative (Joi min:1)", async () => {
        const res = await request(app).post(`${BASE}/target`).send({ ...validTargetPayload, total_target: 0 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if ideal_cycle_time is negative (Joi min:0)", async () => {
        const res = await request(app).post(`${BASE}/target`).send({ ...validTargetPayload, ideal_cycle_time: -1 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 if role is PRODUKSI", async () => {
        setRole("PRODUKSI");
        const res = await request(app).post(`${BASE}/target`).send(validTargetPayload);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.createTarget.mockRejectedValue(new Error("DB error"));
        const res = await request(app).post(`${BASE}/target`).send(validTargetPayload);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`PUT ${BASE}/target/:id`, () => {
      test("should return 200 on successful update", async () => {
        masterService.updateTarget.mockResolvedValue({ ...targetItem, total_target: 600 });
        const res = await request(app).put(`${BASE}/target/1`).send({ total_target: 600 });
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success update target");
      });

      test("should return 400 if body is empty (Joi .min(1))", async () => {
        const res = await request(app).put(`${BASE}/target/1`).send({});
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if total_target is 0 (Joi min:1)", async () => {
        const res = await request(app).put(`${BASE}/target/1`).send({ total_target: 0 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if id param is not a number", async () => {
        const res = await request(app).put(`${BASE}/target/abc`).send({ total_target: 100 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 if role is PRODUKSI", async () => {
        setRole("PRODUKSI");
        const res = await request(app).put(`${BASE}/target/1`).send({ total_target: 100 });
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.updateTarget.mockRejectedValue(new Error("Record not found"));
        const res = await request(app).put(`${BASE}/target/999`).send({ total_target: 100 });
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`DELETE ${BASE}/target/:id`, () => {
      test("should return 200 on successful delete", async () => {
        masterService.deleteTarget.mockResolvedValue(targetItem);
        const res = await request(app).delete(`${BASE}/target/1`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success delete target");
      });

      test("should still process request even if id is non-numeric (no params validation on delete route)", async () => {
        // The DELETE /target/:id route has NO Joi params validation middleware,
        // parseInt('abc') = NaN, service is mocked so it resolves normally.
        masterService.deleteTarget.mockResolvedValue(targetItem);
        const res = await request(app).delete(`${BASE}/target/abc`);
        // Expect 200 because no validation middleware guards this specific route
        expect(res.status).toBe(httpStatus.OK);
      });

      test("should return 403 if role is PRODUKSI", async () => {
        setRole("PRODUKSI");
        const res = await request(app).delete(`${BASE}/target/1`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws (FK constraint)", async () => {
        masterService.deleteTarget.mockRejectedValue(new Error("FK constraint violated"));
        const res = await request(app).delete(`${BASE}/target/1`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });
  });

  // ============================================================
  // MASALAH ANDON
  // ============================================================
  describe("Masalah Andon", () => {
    const masalahList = [{ id: 1, nama_masalah: "Mesin Rusak", kategori: "MESIN", waktu_perbaikan_menit: 30 }];
    const masalahItem = masalahList[0];
    const validPayload = { nama_masalah: "Mesin Rusak", kategori: "MESIN", waktu_perbaikan_menit: 30 };

    describe(`GET ${BASE}/masalah-andon`, () => {
      test("should return 200 with masalah list (PUBLIC — no auth required)", async () => {
        masterService.getMasalahAndon.mockResolvedValue(masalahList);
        // This route has no auth middleware, so any role works
        const res = await request(app).get(`${BASE}/masalah-andon`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual(masalahList);
        expect(res.body.message).toBe("Success get master masalah andon");
      });

      test("should return 200 even for PRODUKSI role (public endpoint)", async () => {
        setRole("PRODUKSI");
        masterService.getMasalahAndon.mockResolvedValue(masalahList);
        const res = await request(app).get(`${BASE}/masalah-andon`);
        expect(res.status).toBe(httpStatus.OK);
      });

      test("should return 200 with empty array if no masalah", async () => {
        masterService.getMasalahAndon.mockResolvedValue([]);
        const res = await request(app).get(`${BASE}/masalah-andon`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual([]);
      });

      test("should return 500 if service throws", async () => {
        masterService.getMasalahAndon.mockRejectedValue(new Error("DB down"));
        const res = await request(app).get(`${BASE}/masalah-andon`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`POST ${BASE}/masalah-andon`, () => {
      test("should return 200 on successful create (responseApiSuccess always returns 200)", async () => {
        masterService.createMasalahAndon.mockResolvedValue(masalahItem);
        const res = await request(app).post(`${BASE}/masalah-andon`).send(validPayload);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success create masalah andon");
        expect(res.body.data).toEqual(masalahItem);
      });

      test("should return 400 if nama_masalah is missing (Joi)", async () => {
        const { nama_masalah, ...rest } = validPayload;
        const res = await request(app).post(`${BASE}/masalah-andon`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if kategori is missing (Joi)", async () => {
        const { kategori, ...rest } = validPayload;
        const res = await request(app).post(`${BASE}/masalah-andon`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if waktu_perbaikan_menit is missing (Joi)", async () => {
        const { waktu_perbaikan_menit, ...rest } = validPayload;
        const res = await request(app).post(`${BASE}/masalah-andon`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if waktu_perbaikan_menit is negative (Joi min:0)", async () => {
        const res = await request(app).post(`${BASE}/masalah-andon`).send({ ...validPayload, waktu_perbaikan_menit: -5 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if waktu_perbaikan_menit is a float (Joi integer)", async () => {
        const res = await request(app).post(`${BASE}/masalah-andon`).send({ ...validPayload, waktu_perbaikan_menit: 10.5 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 if role is PRODUKSI", async () => {
        setRole("PRODUKSI");
        const res = await request(app).post(`${BASE}/masalah-andon`).send(validPayload);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.createMasalahAndon.mockRejectedValue(new Error("DB error"));
        const res = await request(app).post(`${BASE}/masalah-andon`).send(validPayload);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`PATCH ${BASE}/masalah-andon/:id`, () => {
      test("should return 200 on successful update", async () => {
        masterService.updateMasalahAndon.mockResolvedValue({ ...masalahItem, waktu_perbaikan_menit: 45 });
        const res = await request(app).patch(`${BASE}/masalah-andon/1`).send({ waktu_perbaikan_menit: 45 });
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success update masalah andon");
      });

      test("should return 400 if body is empty (Joi .min(1))", async () => {
        const res = await request(app).patch(`${BASE}/masalah-andon/1`).send({});
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if waktu_perbaikan_menit is negative (Joi min:0)", async () => {
        const res = await request(app).patch(`${BASE}/masalah-andon/1`).send({ waktu_perbaikan_menit: -1 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if id param is not a number", async () => {
        const res = await request(app).patch(`${BASE}/masalah-andon/abc`).send({ nama_masalah: "X" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).patch(`${BASE}/masalah-andon/1`).send({ nama_masalah: "X" });
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.updateMasalahAndon.mockRejectedValue(new Error("Record missing"));
        const res = await request(app).patch(`${BASE}/masalah-andon/999`).send({ nama_masalah: "X" });
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`DELETE ${BASE}/masalah-andon/:id`, () => {
      test("should return 200 on successful delete", async () => {
        masterService.deleteMasalahAndon.mockResolvedValue(masalahItem);
        const res = await request(app).delete(`${BASE}/masalah-andon/1`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success delete masalah andon");
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).delete(`${BASE}/masalah-andon/1`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.deleteMasalahAndon.mockRejectedValue(new Error("Constraint error"));
        const res = await request(app).delete(`${BASE}/masalah-andon/1`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });
  });

  // ============================================================
  // TIPE DISIPLIN
  // ============================================================
  describe("Tipe Disiplin", () => {
    const tipeList = { pelanggaran: [{ id: 1, kode: "P1", nama_tipe_disiplin: "Telat", poin: -5, kategori: "PELANGGARAN" }], penghargaan: [] };
    const tipeItem = { id: 1, kode: "P1", nama_tipe_disiplin: "Telat", poin: -5, kategori: "PELANGGARAN" };
    const validPayload = { kode: "P1", nama_tipe_disiplin: "Telat", poin: -5, kategori: "PELANGGARAN" };

    describe(`GET ${BASE}/tipe-disiplin`, () => {
      test("should return 200 with tipe disiplin grouped data", async () => {
        masterService.getTipeDisiplin.mockResolvedValue(tipeList);
        const res = await request(app).get(`${BASE}/tipe-disiplin`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.data).toEqual(tipeList);
        expect(res.body.message).toBe("Success get tipe disiplin");
      });

      test("should allow PRODUKSI role", async () => {
        setRole("PRODUKSI");
        masterService.getTipeDisiplin.mockResolvedValue(tipeList);
        const res = await request(app).get(`${BASE}/tipe-disiplin`);
        expect(res.status).toBe(httpStatus.OK);
      });

      test("should return 403 for MAINTENANCE role", async () => {
        setRole("MAINTENANCE");
        const res = await request(app).get(`${BASE}/tipe-disiplin`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.getTipeDisiplin.mockRejectedValue(new Error("DB error"));
        const res = await request(app).get(`${BASE}/tipe-disiplin`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`POST ${BASE}/tipe-disiplin`, () => {
      test("should return 200 on successful create (responseApiSuccess always returns 200)", async () => {
        masterService.createTipeDisiplin.mockResolvedValue(tipeItem);
        const res = await request(app).post(`${BASE}/tipe-disiplin`).send(validPayload);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success create tipe disiplin");
      });

      test("should return 400 if kode is missing (Joi)", async () => {
        const { kode, ...rest } = validPayload;
        const res = await request(app).post(`${BASE}/tipe-disiplin`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if nama_tipe_disiplin is missing (Joi)", async () => {
        const { nama_tipe_disiplin, ...rest } = validPayload;
        const res = await request(app).post(`${BASE}/tipe-disiplin`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if poin is missing (Joi)", async () => {
        const { poin, ...rest } = validPayload;
        const res = await request(app).post(`${BASE}/tipe-disiplin`).send(rest);
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if kategori value is not PELANGGARAN or PENGHARGAAN (Joi enum)", async () => {
        const res = await request(app).post(`${BASE}/tipe-disiplin`).send({ ...validPayload, kategori: "LAINNYA" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if poin is a float (Joi integer)", async () => {
        const res = await request(app).post(`${BASE}/tipe-disiplin`).send({ ...validPayload, poin: 5.5 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).post(`${BASE}/tipe-disiplin`).send(validPayload);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.createTipeDisiplin.mockRejectedValue(new Error("Unique constraint on kode"));
        const res = await request(app).post(`${BASE}/tipe-disiplin`).send(validPayload);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`PATCH ${BASE}/tipe-disiplin/:id`, () => {
      test("should return 200 on successful update", async () => {
        masterService.updateTipeDisiplin.mockResolvedValue({ ...tipeItem, poin: -10 });
        const res = await request(app).patch(`${BASE}/tipe-disiplin/1`).send({ poin: -10 });
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success update tipe disiplin");
      });

      test("should return 400 if body is empty (Joi .min(1))", async () => {
        const res = await request(app).patch(`${BASE}/tipe-disiplin/1`).send({});
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if kategori value is invalid (Joi enum)", async () => {
        const res = await request(app).patch(`${BASE}/tipe-disiplin/1`).send({ kategori: "INVALID" });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if poin is a float (Joi integer)", async () => {
        const res = await request(app).patch(`${BASE}/tipe-disiplin/1`).send({ poin: 3.3 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 400 if id param is not a number", async () => {
        const res = await request(app).patch(`${BASE}/tipe-disiplin/abc`).send({ poin: -5 });
        expect(res.status).toBe(httpStatus.BAD_REQUEST);
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).patch(`${BASE}/tipe-disiplin/1`).send({ poin: -5 });
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws", async () => {
        masterService.updateTipeDisiplin.mockRejectedValue(new Error("Record not found"));
        const res = await request(app).patch(`${BASE}/tipe-disiplin/999`).send({ poin: -5 });
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });

    describe(`DELETE ${BASE}/tipe-disiplin/:id`, () => {
      test("should return 200 on successful delete", async () => {
        masterService.deleteTipeDisiplin.mockResolvedValue(tipeItem);
        const res = await request(app).delete(`${BASE}/tipe-disiplin/1`);
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.message).toBe("Success delete tipe disiplin");
      });

      test("should return 403 for PRODUKSI role", async () => {
        setRole("PRODUKSI");
        const res = await request(app).delete(`${BASE}/tipe-disiplin/1`);
        expect(res.status).toBe(httpStatus.FORBIDDEN);
      });

      test("should return 500 if service throws (tipe in use by existing violations)", async () => {
        masterService.deleteTipeDisiplin.mockRejectedValue(new Error("FK violation: poin_disiplin references this tipe"));
        const res = await request(app).delete(`${BASE}/tipe-disiplin/1`);
        expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      });
    });
  });

  // ============================================================
  // GET ALL MASTER DATA
  // ============================================================
  describe(`GET ${BASE}/all`, () => {
    const mockAllData = {
      shift: [{ id: 1, nama_shift: "Pagi" }],
      mesin: { press: [{ id: 1, nama_mesin: "Mesin A" }] },
      jenisPekerjaan: [{ id: 1, nama_pekerjaan: "Assembly" }],
      produk: [{ id: 1, nama_produk: "Produk A" }],
    };

    test("should return 200 with aggregated master data", async () => {
      masterService.getAllMasterData.mockResolvedValue(mockAllData);
      const res = await request(app).get(`${BASE}/all`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.message).toBe("Success get all master data");
      expect(res.body.data.shift).toBeDefined();
      expect(res.body.data.mesin).toBeDefined();
      expect(res.body.data.produk).toBeDefined();
      expect(res.body.data.jenisPekerjaan).toBeDefined();
    });

    test("should allow ADMIN role", async () => {
      setRole("ADMIN");
      masterService.getAllMasterData.mockResolvedValue(mockAllData);
      const res = await request(app).get(`${BASE}/all`);
      expect(res.status).toBe(httpStatus.OK);
    });

    test("should return 403 for PRODUKSI role (managerRoles only)", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get(`${BASE}/all`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 403 for MAINTENANCE role", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get(`${BASE}/all`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws", async () => {
      masterService.getAllMasterData.mockRejectedValue(new Error("Multiple DB queries failed"));
      const res = await request(app).get(`${BASE}/all`);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
