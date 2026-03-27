import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// 1. Global Mock Registry
global.__RPH_MOCKS__ = {
  rencanaProduksiService: {
    createRencanaProduksi: jest.fn(),
    getDashboardSummary: jest.fn(),
    getWeeklyTrend: jest.fn(),
    getHistoryRPH: jest.fn(),
    searchOperator: jest.fn(),
    updateRencanaProduksi: jest.fn(),
    deleteRencanaProduksi: jest.fn(),
    getUserRPHList: jest.fn(),
    closeRph: jest.fn(),
    getRencanaProduksiHarian: jest.fn(),
  },
  notificationService: {
    createNotification: jest.fn(),
  },
  mockUser: { id: 1, role: "SUPERVISOR", plant: "1" },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          req.user = global.__RPH_MOCKS__.mockUser;
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
        req.user = global.__RPH_MOCKS__.mockUser;
        next();
      }
    ),
  },
  redis: {
    delByPattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
};

// 2. Register Mocks (ESM)
jest.unstable_mockModule(
  "../src/services/rencanaProduksi.service.js",
  () => ({ default: global.__RPH_MOCKS__.rencanaProduksiService })
);
jest.unstable_mockModule(
  "../src/services/notification.service.js",
  () => ({ default: global.__RPH_MOCKS__.notificationService })
);
jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__RPH_MOCKS__.auth.auth,
  authOptional: global.__RPH_MOCKS__.auth.authOptional,
}));
jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: global.__RPH_MOCKS__.redis,
}));

const { default: app } = await import("../src/app.js");
const { default: ApiError } = await import("../src/utils/ApiError.js");

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
const BASE = "/rencana-produksi";

const setRole = (role) => {
  global.__RPH_MOCKS__.mockUser.role = role;
};
const resetRole = () => {
  global.__RPH_MOCKS__.mockUser.role = "SUPERVISOR";
};

// ──────────────────────────────────────────────────────────────────────────────
// Suites
// ──────────────────────────────────────────────────────────────────────────────
describe("Rencana Produksi Controller Unit Tests", () => {
  const { rencanaProduksiService } = global.__RPH_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRole();
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe(`POST ${BASE}/`, () => {
    const validPayload = {
      fk_id_user: 2,
      fk_id_mesin: 1,
      fk_id_produk: 1,
      fk_id_shift: 1,
      fk_id_target: 1,
      fk_id_jenis_pekerjaan: 1,
      tanggal: "2026-03-26",
      keterangan: "Produksi reguler",
    };

    const mockRPH = {
      id: 10,
      ...validPayload,
      status: "PLANNED",
      user: { id: 2, nama: "Operator A", divisi: { nama_divisi: "Produksi" } },
      mesin: { id: 1, nama_mesin: "Mesin A" },
      produk: { id: 1, nama_produk: "Produk A" },
      shift: { id: 1, nama_shift: "Pagi" },
      target: { id: 1, total_target: 500, jenis_pekerjaan: { nama_pekerjaan: "Assembly" } },
      jenis_pekerjaan: { id: 1, nama_pekerjaan: "Assembly" },
    };

    test("should return 201 and created RPH on valid input", async () => {
      rencanaProduksiService.createRencanaProduksi.mockResolvedValue(mockRPH);

      const res = await request(app).post(`${BASE}/`).send(validPayload);

      expect(res.status).toBe(httpStatus.CREATED);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe("Rencana produksi berhasil dibuat");
      expect(res.body.data.id).toBe(10);
      expect(rencanaProduksiService.createRencanaProduksi).toHaveBeenCalledTimes(1);
    });

    test("should return 201 with keterangan as null (optional field)", async () => {
      const payloadNoKet = { ...validPayload, keterangan: null };
      rencanaProduksiService.createRencanaProduksi.mockResolvedValue({ ...mockRPH, keterangan: null });

      const res = await request(app).post(`${BASE}/`).send(payloadNoKet);
      expect(res.status).toBe(httpStatus.CREATED);
    });

    test("should return 400 if required field fk_id_user is missing (Joi validation)", async () => {
      const { fk_id_user, ...noUser } = validPayload;
      const res = await request(app).post(`${BASE}/`).send(noUser);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/required/);
    });

    test("should return 400 if fk_id_mesin is missing (Joi validation)", async () => {
      const { fk_id_mesin, ...payload } = validPayload;
      const res = await request(app).post(`${BASE}/`).send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 if tanggal is invalid (Joi validation)", async () => {
      const res = await request(app)
        .post(`${BASE}/`)
        .send({ ...validPayload, tanggal: "bukan-tanggal" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 if fk_id_user is not a number (Joi validation)", async () => {
      const res = await request(app)
        .post(`${BASE}/`)
        .send({ ...validPayload, fk_id_user: "abc" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 if FK relations are not valid (user/mesin/etc not found in DB)", async () => {
      rencanaProduksiService.createRencanaProduksi.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Data relasi tidak valid (user/mesin/produk/shift/target/jenis_pekerjaan)")
      );
      const res = await request(app).post(`${BASE}/`).send(validPayload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/relasi/);
    });

    test("should return 403 Forbidden for non-SUPERVISOR role", async () => {
      setRole("PRODUKSI");
      const res = await request(app).post(`${BASE}/`).send(validPayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(res.body.message).toMatch(/Forbidden/);
    });

    test("should return 403 Forbidden for ADMIN role", async () => {
      setRole("ADMIN");
      const res = await request(app).post(`${BASE}/`).send(validPayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws unexpected error", async () => {
      rencanaProduksiService.createRencanaProduksi.mockRejectedValue(
        new Error("DB_CONNECTION_ERROR")
      );
      const res = await request(app).post(`${BASE}/`).send(validPayload);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe(`GET ${BASE}/my-rph`, () => {
    const mockRPHList = [
      {
        id: 1,
        status: "ACTIVE",
        tanggal: "2026-03-26",
        mesin: { id: 1, nama: "Mesin A" },
        produk: { id: 1, nama: "Produk A" },
        jenis_pekerjaan: { id: 1, nama: "Assembly" },
        target: { id: 1, total_target: 500 },
      },
    ];

    test("should return 200 with RPH list for current user", async () => {
      rencanaProduksiService.getUserRPHList.mockResolvedValue(mockRPHList);

      const res = await request(app).get(`${BASE}/my-rph`);

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data).toEqual(mockRPHList);
    });

    test("should return 200 with valid tanggal query param", async () => {
      rencanaProduksiService.getUserRPHList.mockResolvedValue(mockRPHList);

      const res = await request(app).get(`${BASE}/my-rph?tanggal=2026-03-26`);
      expect(res.status).toBe(httpStatus.OK);
      // Controller formats tanggal via moment before passing to service — just verify it was called with the right userId
      expect(rencanaProduksiService.getUserRPHList).toHaveBeenCalledWith(1, expect.any(String));
    });

    test("should return 200 with empty array if no RPH exists for the day", async () => {
      rencanaProduksiService.getUserRPHList.mockResolvedValue([]);
      const res = await request(app).get(`${BASE}/my-rph`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual([]);
    });

    test("should return 400 if tanggal query param has invalid format", async () => {
      const res = await request(app).get(`${BASE}/my-rph?tanggal=26-03-2026`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 403 Forbidden if user role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get(`${BASE}/my-rph`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws unexpected error", async () => {
      rencanaProduksiService.getUserRPHList.mockRejectedValue(
        new Error("Unexpected failure")
      );
      const res = await request(app).get(`${BASE}/my-rph`);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe(`POST ${BASE}/close-rph/:rphId`, () => {
    const closedRPH = { id: 5, status: "CLOSED" };

    test("should return 200 and close the RPH successfully", async () => {
      rencanaProduksiService.closeRph.mockResolvedValue(closedRPH);

      const res = await request(app).post(`${BASE}/close-rph/5`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe("RPH berhasil ditutup");
      expect(res.body.data.status).toBe("CLOSED");
    });

    test("should pass parsed integer rphId to service", async () => {
      rencanaProduksiService.closeRph.mockResolvedValue(closedRPH);
      await request(app).post(`${BASE}/close-rph/5`);
      expect(rencanaProduksiService.closeRph).toHaveBeenCalledWith(5);
    });

    test("should return 404 if rphId does not exist", async () => {
      rencanaProduksiService.closeRph.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Rencana Produksi tidak ditemukan")
      );
      const res = await request(app).post(`${BASE}/close-rph/999`);
      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Rencana Produksi tidak ditemukan");
    });

    test("should return 400 if RPH is already CLOSED", async () => {
      rencanaProduksiService.closeRph.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "RPH sudah dalam status CLOSED")
      );
      const res = await request(app).post(`${BASE}/close-rph/5`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/CLOSED/);
    });

    test("should return 403 if user role is PRODUKSI (not in allowed roles)", async () => {
      // PRODUKSI is allowed, so let's test with a disallowed role
      setRole("MAINTENANCE");
      const res = await request(app).post(`${BASE}/close-rph/5`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws generic error", async () => {
      rencanaProduksiService.closeRph.mockRejectedValue(
        new Error("Runtime error")
      );
      const res = await request(app).post(`${BASE}/close-rph/5`);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe(`GET ${BASE}/dashboard/summary`, () => {
    const mockSummary = {
      summary: { target_harian: 1500, tercapai: 1200, persentase: 80 },
      operator: { total: 30, aktif: 25, label: "25 operator" },
      shift_details: [],
      trend_produksi_mingguan: [],
    };

    test("should return 200 with dashboard summary data", async () => {
      rencanaProduksiService.getDashboardSummary.mockResolvedValue(mockSummary);

      const res = await request(app).get(`${BASE}/dashboard/summary`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.summary.target_harian).toBe(1500);
    });

    test("should pass tanggal query param to service when provided", async () => {
      rencanaProduksiService.getDashboardSummary.mockResolvedValue(mockSummary);
      await request(app).get(`${BASE}/dashboard/summary?tanggal=2026-03-25`);
      expect(rencanaProduksiService.getDashboardSummary).toHaveBeenCalledWith("2026-03-25");
    });

    test("should pass undefined to service when tanggal is not provided", async () => {
      rencanaProduksiService.getDashboardSummary.mockResolvedValue(mockSummary);
      await request(app).get(`${BASE}/dashboard/summary`);
      expect(rencanaProduksiService.getDashboardSummary).toHaveBeenCalledWith(undefined);
    });

    test("should return 200 with zero targets on empty production day", async () => {
      rencanaProduksiService.getDashboardSummary.mockResolvedValue({
        summary: { target_harian: 0, tercapai: 0, persentase: 0 },
        operator: { total: 30, aktif: 0, label: "0 operator" },
        shift_details: [],
        trend_produksi_mingguan: [],
      });
      const res = await request(app).get(`${BASE}/dashboard/summary`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.summary.persentase).toBe(0);
    });

    test("should return 403 if role is PRODUKSI (not allowed)", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get(`${BASE}/dashboard/summary`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 403 if role is ADMIN (not allowed)", async () => {
      setRole("ADMIN");
      const res = await request(app).get(`${BASE}/dashboard/summary`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws unexpected error", async () => {
      rencanaProduksiService.getDashboardSummary.mockRejectedValue(
        new Error("DB timeout")
      );
      const res = await request(app).get(`${BASE}/dashboard/summary`);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe(`GET ${BASE}/dashboard/weekly-trend`, () => {
    const mockTrend = [
      { tanggal: "2026-03-20", _sum: { id: 5 } },
      { tanggal: "2026-03-21", _sum: { id: 8 } },
    ];

    test("should return 200 with weekly trend data", async () => {
      rencanaProduksiService.getWeeklyTrend.mockResolvedValue(mockTrend);

      const res = await request(app).get(`${BASE}/dashboard/weekly-trend`);
      expect(res.status).toBe(httpStatus.OK);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    test("should return 200 with empty array if no data in current week", async () => {
      rencanaProduksiService.getWeeklyTrend.mockResolvedValue([]);
      const res = await request(app).get(`${BASE}/dashboard/weekly-trend`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body).toEqual([]);
    });

    test("should return 403 if role is not SUPERVISOR", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get(`${BASE}/dashboard/weekly-trend`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws", async () => {
      rencanaProduksiService.getWeeklyTrend.mockRejectedValue(
        new Error("Failed to fetch trend")
      );
      const res = await request(app).get(`${BASE}/dashboard/weekly-trend`);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe(`GET ${BASE}/list`, () => {
    const mockHistory = {
      tanggal: "2026-03-26",
      data: [
        { nama: "Operator A", detail: "Mesin A • Produk A", shift: "Pagi", kategori_shift: "Normal", target: 500 },
      ],
    };

    test("should return 200 with RPH history list", async () => {
      rencanaProduksiService.getHistoryRPH.mockResolvedValue(mockHistory);

      const res = await request(app).get(`${BASE}/list`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data).toEqual(mockHistory.data);
    });

    test("should return 200 with tanggal filter passed to service", async () => {
      rencanaProduksiService.getHistoryRPH.mockResolvedValue(mockHistory);
      await request(app).get(`${BASE}/list?tanggal=2026-03-26`);
      expect(rencanaProduksiService.getHistoryRPH).toHaveBeenCalledWith("2026-03-26");
    });

    test("should return 200 with empty data list when no RPH on that date", async () => {
      rencanaProduksiService.getHistoryRPH.mockResolvedValue({ tanggal: "2026-03-26", data: [] });
      const res = await request(app).get(`${BASE}/list`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual([]);
    });

    test("should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get(`${BASE}/list`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws", async () => {
      rencanaProduksiService.getHistoryRPH.mockRejectedValue(
        new Error("Query gagal")
      );
      const res = await request(app).get(`${BASE}/list`);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe(`GET ${BASE}/search-operator`, () => {
    const mockOperator = {
      id: 5,
      nama: "Budi Operator",
      current_point: 95,
      divisi: { nama_divisi: "Produksi" },
    };

    test("should return 200 with operator data when found", async () => {
      rencanaProduksiService.searchOperator.mockResolvedValue(mockOperator);

      const res = await request(app).get(`${BASE}/search-operator?q=Budi`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.id).toBe(5);
      expect(res.body.nama).toBe("Budi Operator");
    });

    test("should pass query string q to service", async () => {
      rencanaProduksiService.searchOperator.mockResolvedValue(mockOperator);
      await request(app).get(`${BASE}/search-operator?q=ABC123`);
      expect(rencanaProduksiService.searchOperator).toHaveBeenCalledWith("ABC123");
    });

    test("should return 200 with null/empty body when operator not found", async () => {
      rencanaProduksiService.searchOperator.mockResolvedValue(null);
      const res = await request(app).get(`${BASE}/search-operator?q=ghost`);
      expect(res.status).toBe(httpStatus.OK);
      // SuperTest parses a null JSON body as {} — just assert nothing meaningful is returned
      expect(res.body.id).toBeUndefined();
    });

    test("should return 200 when no query param is provided (q is undefined)", async () => {
      rencanaProduksiService.searchOperator.mockResolvedValue(null);
      const res = await request(app).get(`${BASE}/search-operator`);
      expect(res.status).toBe(httpStatus.OK);
    });

    test("should return 403 if role is not SUPERVISOR", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get(`${BASE}/search-operator?q=Budi`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws", async () => {
      rencanaProduksiService.searchOperator.mockRejectedValue(
        new Error("DB error saat search")
      );
      const res = await request(app).get(`${BASE}/search-operator?q=Budi`);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe(`PUT ${BASE}/:rphId`, () => {
    const updatedRPH = { id: 10, status: "ACTIVE", fk_id_produk: 2 };

    test("should return 200 and updated RPH on valid input", async () => {
      rencanaProduksiService.updateRencanaProduksi.mockResolvedValue(updatedRPH);

      const res = await request(app)
        .put(`${BASE}/10`)
        .send({ fk_id_produk: 2 });
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe("Rencana produksi berhasil diperbarui");
      expect(res.body.data.fk_id_produk).toBe(2);
    });

    test("should return 200 when updating only status to ACTIVE", async () => {
      rencanaProduksiService.updateRencanaProduksi.mockResolvedValue({ ...updatedRPH, status: "ACTIVE" });
      const res = await request(app).put(`${BASE}/10`).send({ status: "ACTIVE" });
      expect(res.status).toBe(httpStatus.OK);
    });

    test("should return 400 if body is empty (Joi .min(1) validation)", async () => {
      const res = await request(app).put(`${BASE}/10`).send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 if status value is invalid (Joi validation)", async () => {
      const res = await request(app)
        .put(`${BASE}/10`)
        .send({ status: "INVALID_STATUS" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 if rphId param is not a valid number", async () => {
      const res = await request(app)
        .put(`${BASE}/abc`)
        .send({ status: "ACTIVE" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 404 if rphId does not exist", async () => {
      rencanaProduksiService.updateRencanaProduksi.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Rencana Produksi tidak ditemukan")
      );
      const res = await request(app).put(`${BASE}/999`).send({ fk_id_produk: 2 });
      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Rencana Produksi tidak ditemukan");
    });

    test("should return 403 if role is PRODUKSI (not SUPERVISOR)", async () => {
      setRole("PRODUKSI");
      const res = await request(app).put(`${BASE}/10`).send({ fk_id_produk: 2 });
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws unexpected error", async () => {
      rencanaProduksiService.updateRencanaProduksi.mockRejectedValue(
        new Error("DB write error")
      );
      const res = await request(app).put(`${BASE}/10`).send({ fk_id_produk: 2 });
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe(`DELETE ${BASE}/:rphId`, () => {
    test("should return 200 on successful deletion", async () => {
      rencanaProduksiService.deleteRencanaProduksi.mockResolvedValue(true);

      const res = await request(app).delete(`${BASE}/10`);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe("Rencana produksi berhasil dihapus");
    });

    test("should return 404 if rphId does not exist", async () => {
      rencanaProduksiService.deleteRencanaProduksi.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Rencana Produksi tidak ditemukan")
      );
      const res = await request(app).delete(`${BASE}/999`);
      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Rencana Produksi tidak ditemukan");
    });

    test("should return 400 if RPH has associated LRP data", async () => {
      rencanaProduksiService.deleteRencanaProduksi.mockRejectedValue(
        new ApiError(
          httpStatus.BAD_REQUEST,
          "Gagal menghapus! RPH ini sudah memiliki Laporan Realisasi Produksi (LRP). Hapus LRP terlebih dahulu jika ingin menghapus RPH ini."
        )
      );
      const res = await request(app).delete(`${BASE}/5`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/LRP/);
    });

    test("should return 400 if RPH has associated attendance data", async () => {
      rencanaProduksiService.deleteRencanaProduksi.mockRejectedValue(
        new ApiError(
          httpStatus.BAD_REQUEST,
          "Gagal menghapus! Sudah ada data absensi untuk RPH ini. Silakan hapus data absensi terlebih dahulu jika diperlukan."
        )
      );
      const res = await request(app).delete(`${BASE}/5`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/absensi/);
    });

    test("should return 400 if rphId is not valid (Joi validation)", async () => {
      const res = await request(app).delete(`${BASE}/abc`);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 403 if role is not SUPERVISOR", async () => {
      setRole("PRODUKSI");
      const res = await request(app).delete(`${BASE}/10`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 403 if role is ADMIN", async () => {
      setRole("ADMIN");
      const res = await request(app).delete(`${BASE}/10`);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 500 if service throws unexpected error", async () => {
      rencanaProduksiService.deleteRencanaProduksi.mockRejectedValue(
        new Error("Constraint violation")
      );
      const res = await request(app).delete(`${BASE}/10`);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
