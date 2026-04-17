import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Global Mock Registry ────────────────────────────────────────────────
// All jest.fn() must be created BEFORE jest.unstable_mockModule calls.
global.__LRP_MOCKS__ = {
  lrpService: {
    createLrp: jest.fn(),
    queryLrps: jest.fn(),
    getLrpById: jest.fn(),
    updateLrpById: jest.fn(),
    deleteLrpById: jest.fn(),
  },
  mockUser: { id: 1, role: "ADMIN", noReg: "REG123" },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          if (!global.__LRP_MOCKS__.isLoggedIn) {
            return res.status(httpStatus.UNAUTHORIZED).json({
              status: false,
              message: "Please authenticate",
            });
          }
          req.user = global.__LRP_MOCKS__.mockUser;
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
  // Mock for socket emitOeeUpdate - stored here so we can assert on it
  emitOeeUpdate: jest.fn(),
  isLoggedIn: true,
};

// ─── 2. Register ESM Mocks ───────────────────────────────────────────────────
// IMPORTANT: All unstable_mockModule calls must come BEFORE any dynamic imports.

jest.unstable_mockModule("../src/services/lrp.service.js", () => ({
  default: global.__LRP_MOCKS__.lrpService,
}));

jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__LRP_MOCKS__.auth.auth,
}));

jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: global.__LRP_MOCKS__.redis,
}));

// Mock socket.js so emitOeeUpdate is a spy we can assert on.
// socket.io is not initialized in test mode, so we must mock to avoid errors.
jest.unstable_mockModule("../src/config/socket.js", () => ({
  emitOeeUpdate: global.__LRP_MOCKS__.emitOeeUpdate,
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

// ─── 3. Dynamic Imports (AFTER all mocks are registered) ─────────────────────
const { default: app } = await import("../src/app.js");
const { default: ApiError } = await import("../src/utils/ApiError.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────
const setRole = (role) => {
  global.__LRP_MOCKS__.mockUser.role = role;
};
const setLoggedIn = (val) => {
  global.__LRP_MOCKS__.isLoggedIn = val;
};
const resetState = () => {
  global.__LRP_MOCKS__.mockUser.role = "ADMIN";
  global.__LRP_MOCKS__.isLoggedIn = true;
};

// ─── Data Fixtures ────────────────────────────────────────────────────────────
const validCreatePayload = {
  tanggal: "2025-01-15",
  shiftId: 1,
  mesinId: 10,
  operatorId: 5,
  rphId: 100,
  noKanagata: "KNG-001",
  noLot: "LOT-2025-01",
  noReg: "REG-001",
  qtyOk: 50,
  qtyNgPrev: 2,
  qtyNgProses: 1,
  qtyRework: 3,
  counterStart: 1000,
  counterEnd: 1056,
};

const mockLrp = {
  id: 1,
  rphId: 100,
  mesinId: 10,
  shiftId: 1,
  operatorId: 5,
  tanggal: "2025-01-15T00:00:00.000Z",
  noKanagata: "KNG-001",
  noLot: "LOT-2025-01",
  noReg: "REG-001",
  qtyOk: 50,
  qtyNgPrev: 2,
  qtyNgProses: 1,
  qtyRework: 3,
  qtyTotalProd: 56,
  loadingTime: 480,
  cycleTime: 30,
  counterStart: 1000,
  counterEnd: 1056,
  keterangan: null,
  createdAt: "2025-01-15T08:00:00.000Z",
  updatedAt: "2025-01-15T08:00:00.000Z",
  operator: { id: 5, nama: "Operator A" },
  mesin: { id: 10, namaMesin: "Mesin 10" },
  shift: { id: 1, namaShift: "Shift Pagi" },
  rencanaProduksi: {
    id: 100,
    status: "CLOSED",
    produk: { id: 1, namaProduk: "Produk A" },
    jenisPekerjaan: { id: 1, namaJenis: "Stamping" },
  },
};

const mockPaginatedResult = {
  results: [mockLrp],
  page: 1,
  limit: 10,
  totalPages: 1,
  totalResults: 1,
};

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("LRP Controller - Comprehensive Unit Tests", () => {
  const { lrpService, emitOeeUpdate } = global.__LRP_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
  });

  // ===========================================================================
  // POST /lrp — Create LRP
  // ===========================================================================
  describe("POST /lrp", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 201 on successful LRP creation (ADMIN role)", async () => {
      lrpService.createLrp.mockResolvedValue(mockLrp);

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.CREATED);
      expect(res.body.data.id).toBe(1);
      expect(res.body.data.qtyTotalProd).toBe(56);
      // Joi coerces tanggal string → Date object before passing to service
      expect(lrpService.createLrp).toHaveBeenCalledWith(
        expect.objectContaining({
          rphId: validCreatePayload.rphId,
          mesinId: validCreatePayload.mesinId,
          shiftId: validCreatePayload.shiftId,
          qtyOk: validCreatePayload.qtyOk,
          noKanagata: validCreatePayload.noKanagata,
        })
      );
    });

    test("✅ should return 201 on successful LRP creation (PRODUKSI role)", async () => {
      setRole("PRODUKSI");
      lrpService.createLrp.mockResolvedValue(mockLrp);

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.CREATED);
    });

    test("✅ should emit OEE update after successful creation", async () => {
      lrpService.createLrp.mockResolvedValue(mockLrp);

      await request(app).post("/lrp").send(validCreatePayload);

      expect(emitOeeUpdate).toHaveBeenCalledWith({
        mesinId: mockLrp.mesinId,
        tanggal: mockLrp.tanggal,
        shiftId: mockLrp.shiftId,
      });
    });

    test("✅ should create LRP with counterStart/counterEnd as null (optional)", async () => {
      const payload = { ...validCreatePayload, counterStart: null, counterEnd: null };
      lrpService.createLrp.mockResolvedValue({ ...mockLrp, counterStart: null, counterEnd: null });

      const res = await request(app).post("/lrp").send(payload);

      expect(res.status).toBe(httpStatus.CREATED);
      expect(res.body.data.counterStart).toBeNull();
    });

    test("✅ should create LRP without counter fields (fields are optional)", async () => {
      const { counterStart, counterEnd, ...payload } = validCreatePayload;
      lrpService.createLrp.mockResolvedValue({ ...mockLrp, counterStart: null, counterEnd: null });

      const res = await request(app).post("/lrp").send(payload);

      expect(res.status).toBe(httpStatus.CREATED);
    });

    test("✅ should accept qtyOk=1 with all NG/Rework fields at 0 (total=1 passes validator)", async () => {
      const payload = { ...validCreatePayload, qtyOk: 1, qtyNgPrev: 0, qtyNgProses: 0, qtyRework: 0 };
      lrpService.createLrp.mockResolvedValue({ ...mockLrp, qtyOk: 1, qtyTotalProd: 1 });

      const res = await request(app).post("/lrp").send(payload);

      expect(res.status).toBe(httpStatus.CREATED);
    });

    test("✅ should return message 'LRP created successfully'", async () => {
      lrpService.createLrp.mockResolvedValue(mockLrp);

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.body.message).toBe("LRP created successfully");
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if request is not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(lrpService.createLrp).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is SUPERVISOR (not authorized to create)", async () => {
      setRole("SUPERVISOR");

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(lrpService.createLrp).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).post("/lrp").send(validCreatePayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).post("/lrp").send(validCreatePayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).post("/lrp").send(validCreatePayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if tanggal is missing", async () => {
      const { tanggal, ...payload } = validCreatePayload;
      const res = await request(app).post("/lrp").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if shiftId is missing", async () => {
      const { shiftId, ...payload } = validCreatePayload;
      const res = await request(app).post("/lrp").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if mesinId is missing", async () => {
      const { mesinId, ...payload } = validCreatePayload;
      const res = await request(app).post("/lrp").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if operatorId is missing", async () => {
      const { operatorId, ...payload } = validCreatePayload;
      const res = await request(app).post("/lrp").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if rphId is missing", async () => {
      const { rphId, ...payload } = validCreatePayload;
      const res = await request(app).post("/lrp").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if noKanagata is missing", async () => {
      const { noKanagata, ...payload } = validCreatePayload;
      const res = await request(app).post("/lrp").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if noLot is missing", async () => {
      const { noLot, ...payload } = validCreatePayload;
      const res = await request(app).post("/lrp").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if noReg is missing", async () => {
      const { noReg, ...payload } = validCreatePayload;
      const res = await request(app).post("/lrp").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if qtyOk is missing", async () => {
      const { qtyOk, ...payload } = validCreatePayload;
      const res = await request(app).post("/lrp").send(payload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if qtyOk is negative (min: 0)", async () => {
      const res = await request(app).post("/lrp").send({ ...validCreatePayload, qtyOk: -1 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if qtyNgProses is negative (min: 0)", async () => {
      const res = await request(app).post("/lrp").send({ ...validCreatePayload, qtyNgProses: -5 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if qtyRework is negative (min: 0)", async () => {
      const res = await request(app).post("/lrp").send({ ...validCreatePayload, qtyRework: -1 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if qtyNgPrev is negative (min: 0)", async () => {
      const res = await request(app).post("/lrp").send({ ...validCreatePayload, qtyNgPrev: -2 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if all qty fields are 0 (custom validator: total <= 0)", async () => {
      const res = await request(app).post("/lrp").send({
        ...validCreatePayload,
        qtyOk: 0,
        qtyNgPrev: 0,
        qtyNgProses: 0,
        qtyRework: 0,
      });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if shiftId is a decimal float (integer required)", async () => {
      const res = await request(app).post("/lrp").send({ ...validCreatePayload, shiftId: 1.5 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if mesinId is a non-numeric string", async () => {
      const res = await request(app).post("/lrp").send({ ...validCreatePayload, mesinId: "mesin-abc" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if counterEnd is negative (min: 0)", async () => {
      const res = await request(app).post("/lrp").send({ ...validCreatePayload, counterEnd: -1 });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if payload is completely empty", async () => {
      const res = await request(app).post("/lrp").send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    // ── Service / Business Logic Error Cases ──────────────────────────────
    test("❌ should return 404 if RPH (Rencana Produksi) not found", async () => {
      lrpService.createLrp.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Rencana Produksi tidak ditemukan")
      );

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Rencana Produksi tidak ditemukan");
    });

    test("❌ should return 400 if RPH status is not ACTIVE or CLOSED", async () => {
      lrpService.createLrp.mockRejectedValue(
        new ApiError(
          httpStatus.BAD_REQUEST,
          "LRP hanya dapat dibuat untuk Rencana Produksi (RPH) yang berstatus ACTIVE atau CLOSED."
        )
      );

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("ACTIVE atau CLOSED");
    });

    test("❌ should return 409 if LRP already exists for this rphId (1:1 mapping violation)", async () => {
      lrpService.createLrp.mockRejectedValue(
        new ApiError(
          httpStatus.CONFLICT,
          "LRP for this rphId already exists (Strict 1:1 Mapping)"
        )
      );

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.CONFLICT);
      expect(res.body.message).toContain("1:1");
    });

    test("❌ should return 400 if rphId validation fails at service layer", async () => {
      lrpService.createLrp.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "ID Rencana Produksi (rphId) wajib diisi")
      );

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/rphId/);
    });

    test("❌ should return 500 on uncaught database/Prisma failure", async () => {
      lrpService.createLrp.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma transaction failure (P2028)", async () => {
      lrpService.createLrp.mockRejectedValue(
        Object.assign(new Error("Transaction failed"), { code: "P2028" })
      );

      const res = await request(app).post("/lrp").send(validCreatePayload);

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should NOT emit OEE update if service throws an error", async () => {
      lrpService.createLrp.mockRejectedValue(new Error("DB Fail"));

      await request(app).post("/lrp").send(validCreatePayload);

      expect(emitOeeUpdate).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // GET /lrp — Query LRPs
  // ===========================================================================
  describe("GET /lrp", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 and paginated LRP list with no filters", async () => {
      lrpService.queryLrps.mockResolvedValue(mockPaginatedResult);

      const res = await request(app).get("/lrp");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.results).toHaveLength(1);
      expect(res.body.data.totalResults).toBe(1);
      expect(lrpService.queryLrps).toHaveBeenCalled();
    });

    test("✅ should return 200 with filter tanggal applied", async () => {
      lrpService.queryLrps.mockResolvedValue(mockPaginatedResult);

      const res = await request(app).get("/lrp?tanggal=2025-01-15");

      expect(res.status).toBe(httpStatus.OK);
      expect(lrpService.queryLrps).toHaveBeenCalledWith(
        expect.objectContaining({ tanggal: expect.anything() }),
        expect.any(Object)
      );
    });

    test("✅ should return 200 with filter shiftId applied", async () => {
      lrpService.queryLrps.mockResolvedValue(mockPaginatedResult);

      const res = await request(app).get("/lrp?shiftId=1");

      expect(res.status).toBe(httpStatus.OK);
      // Joi coerces shiftId query string → number
      expect(lrpService.queryLrps).toHaveBeenCalledWith(
        expect.objectContaining({ shiftId: expect.anything() }),
        expect.any(Object)
      );
    });

    test("✅ should return 200 with filter noKanagata applied", async () => {
      lrpService.queryLrps.mockResolvedValue(mockPaginatedResult);
      const res = await request(app).get("/lrp?noKanagata=KNG");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with pagination params (page & limit)", async () => {
      lrpService.queryLrps.mockResolvedValue({ ...mockPaginatedResult, page: 2, limit: 5 });

      const res = await request(app).get("/lrp?page=2&limit=5");

      expect(res.status).toBe(httpStatus.OK);
      // Joi coerces page/limit query strings → integers
      expect(lrpService.queryLrps).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ page: expect.anything(), limit: expect.anything() })
      );
    });

    test("✅ should return 200 with sortBy param applied", async () => {
      lrpService.queryLrps.mockResolvedValue(mockPaginatedResult);
      const res = await request(app).get("/lrp?sortBy=tanggal");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with all filters combined", async () => {
      lrpService.queryLrps.mockResolvedValue(mockPaginatedResult);
      const res = await request(app).get("/lrp?tanggal=2025-01-15&shiftId=1&noKanagata=KNG&page=1&limit=20");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with empty results list (no records match)", async () => {
      lrpService.queryLrps.mockResolvedValue({
        results: [], page: 1, limit: 10, totalPages: 0, totalResults: 0,
      });

      const res = await request(app).get("/lrp");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.results).toHaveLength(0);
      expect(res.body.data.totalResults).toBe(0);
    });

    test("✅ should return message 'LRPs retrieved successfully'", async () => {
      lrpService.queryLrps.mockResolvedValue(mockPaginatedResult);
      const res = await request(app).get("/lrp");
      expect(res.body.message).toBe("LRPs retrieved successfully");
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/lrp");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(lrpService.queryLrps).not.toHaveBeenCalled();
    });

    test("✅ all authenticated roles should be able to GET /lrp", async () => {
      const roles = ["ADMIN", "PRODUKSI", "SUPERVISOR", "MAINTENANCE", "QUALITY", "DIE_MAINT"];
      lrpService.queryLrps.mockResolvedValue(mockPaginatedResult);

      for (const role of roles) {
        setRole(role);
        const res = await request(app).get("/lrp");
        expect(res.status).toBe(httpStatus.OK);
      }
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if tanggal is an invalid date string", async () => {
      const res = await request(app).get("/lrp?tanggal=not-a-date");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if shiftId is a non-numeric string", async () => {
      const res = await request(app).get("/lrp?shiftId=abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if page is non-integer", async () => {
      const res = await request(app).get("/lrp?page=abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if limit is non-integer", async () => {
      const res = await request(app).get("/lrp?limit=abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 500 if service throws on query", async () => {
      lrpService.queryLrps.mockRejectedValue(new Error("DB_TIMEOUT"));
      const res = await request(app).get("/lrp");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      lrpService.queryLrps.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );
      const res = await request(app).get("/lrp");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // GET /lrp/:lrpId — Get single LRP
  // ===========================================================================
  describe("GET /lrp/:lrpId", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 and full LRP detail for valid ID", async () => {
      lrpService.getLrpById.mockResolvedValue(mockLrp);

      const res = await request(app).get("/lrp/1");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.id).toBe(1);
      expect(res.body.data.noKanagata).toBe("KNG-001");
    });

    test("✅ should return related data (operator, mesin, shift, rencanaProduksi)", async () => {
      lrpService.getLrpById.mockResolvedValue(mockLrp);

      const res = await request(app).get("/lrp/1");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.operator.nama).toBe("Operator A");
      expect(res.body.data.mesin.namaMesin).toBe("Mesin 10");
      expect(res.body.data.shift.namaShift).toBe("Shift Pagi");
      expect(res.body.data.rencanaProduksi.produk.namaProduk).toBe("Produk A");
    });

    test("✅ should return message 'LRP details retrieved successfully'", async () => {
      lrpService.getLrpById.mockResolvedValue(mockLrp);
      const res = await request(app).get("/lrp/1");
      expect(res.body.message).toBe("LRP details retrieved successfully");
    });

    test("✅ should work for any authenticated role", async () => {
      lrpService.getLrpById.mockResolvedValue(mockLrp);
      const roles = ["ADMIN", "PRODUKSI", "SUPERVISOR", "MAINTENANCE", "QUALITY"];

      for (const role of roles) {
        setRole(role);
        const res = await request(app).get("/lrp/1");
        expect(res.status).toBe(httpStatus.OK);
      }
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/lrp/1");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(lrpService.getLrpById).not.toHaveBeenCalled();
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if lrpId is a non-numeric string", async () => {
      const res = await request(app).get("/lrp/abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if lrpId is a float (non-integer)", async () => {
      const res = await request(app).get("/lrp/1.5");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 404 if LRP is not found (service returns null)", async () => {
      lrpService.getLrpById.mockResolvedValue(null);

      const res = await request(app).get("/lrp/999");

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("LRP not found");
    });

    test("❌ should return 404 for a very large non-existent ID", async () => {
      lrpService.getLrpById.mockResolvedValue(null);
      const res = await request(app).get("/lrp/999999999");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("❌ should return 500 on database failure", async () => {
      lrpService.getLrpById.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).get("/lrp/1");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // PATCH /lrp/:lrpId — Update LRP
  // ===========================================================================
  describe("PATCH /lrp/:lrpId", () => {
    const validUpdatePayload = { statusLrp: "VERIFIED" };

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 on successful update (ADMIN role)", async () => {
      const updatedLrp = { ...mockLrp, statusLrp: "VERIFIED" };
      lrpService.updateLrpById.mockResolvedValue(updatedLrp);

      const res = await request(app).patch("/lrp/1").send(validUpdatePayload);

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.statusLrp).toBe("VERIFIED");
      expect(lrpService.updateLrpById).toHaveBeenCalledWith(1, validUpdatePayload);
    });

    test("✅ should return 200 on successful update (SUPERVISOR role)", async () => {
      setRole("SUPERVISOR");
      lrpService.updateLrpById.mockResolvedValue({ ...mockLrp, statusLrp: "SUBMITTED" });

      const res = await request(app).patch("/lrp/1").send({ statusLrp: "SUBMITTED" });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept statusLrp = 'SUBMITTED'", async () => {
      lrpService.updateLrpById.mockResolvedValue({ ...mockLrp, statusLrp: "SUBMITTED" });
      const res = await request(app).patch("/lrp/1").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept statusLrp = 'VERIFIED'", async () => {
      lrpService.updateLrpById.mockResolvedValue({ ...mockLrp, statusLrp: "VERIFIED" });
      const res = await request(app).patch("/lrp/1").send({ statusLrp: "VERIFIED" });
      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should emit OEE update after successful patch", async () => {
      lrpService.updateLrpById.mockResolvedValue(mockLrp);

      await request(app).patch("/lrp/1").send(validUpdatePayload);

      expect(emitOeeUpdate).toHaveBeenCalledWith({
        mesinId: mockLrp.mesinId,
        tanggal: mockLrp.tanggal,
        shiftId: mockLrp.shiftId,
      });
    });

    test("✅ should return message 'LRP updated successfully'", async () => {
      lrpService.updateLrpById.mockResolvedValue(mockLrp);
      const res = await request(app).patch("/lrp/1").send(validUpdatePayload);
      expect(res.body.message).toBe("LRP updated successfully");
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).patch("/lrp/1").send(validUpdatePayload);

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(lrpService.updateLrpById).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI (not authorized)", async () => {
      setRole("PRODUKSI");
      const res = await request(app).patch("/lrp/1").send(validUpdatePayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(lrpService.updateLrpById).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).patch("/lrp/1").send(validUpdatePayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).patch("/lrp/1").send(validUpdatePayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).patch("/lrp/1").send(validUpdatePayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if body is empty (min(1) constraint)", async () => {
      const res = await request(app).patch("/lrp/1").send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if statusLrp is an invalid enum value", async () => {
      const res = await request(app).patch("/lrp/1").send({ statusLrp: "INVALID_STATUS" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if statusLrp is lowercase (enum is case-sensitive)", async () => {
      const res = await request(app).patch("/lrp/1").send({ statusLrp: "verified" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if lrpId param is a non-numeric string", async () => {
      const res = await request(app).patch("/lrp/abc").send(validUpdatePayload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if lrpId param is a float", async () => {
      const res = await request(app).patch("/lrp/1.5").send(validUpdatePayload);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 404 if LRP not found during update", async () => {
      lrpService.updateLrpById.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "LRP not found")
      );

      const res = await request(app).patch("/lrp/999").send(validUpdatePayload);

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("LRP not found");
    });

    test("❌ should return 500 on database failure during update", async () => {
      lrpService.updateLrpById.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).patch("/lrp/1").send(validUpdatePayload);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should NOT emit OEE update if service throws", async () => {
      lrpService.updateLrpById.mockRejectedValue(new Error("DB Fail"));
      await request(app).patch("/lrp/1").send(validUpdatePayload);
      expect(emitOeeUpdate).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // DELETE /lrp/:lrpId — Delete LRP
  // ===========================================================================
  describe("DELETE /lrp/:lrpId", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 on successful deletion (ADMIN role)", async () => {
      lrpService.deleteLrpById.mockResolvedValue(mockLrp);

      const res = await request(app).delete("/lrp/1");

      expect(res.status).toBe(httpStatus.OK);
      expect(lrpService.deleteLrpById).toHaveBeenCalledWith(1);
    });

    test("✅ should return 200 on successful deletion (SUPERVISOR role)", async () => {
      setRole("SUPERVISOR");
      lrpService.deleteLrpById.mockResolvedValue(mockLrp);

      const res = await request(app).delete("/lrp/1");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should emit OEE update after successful deletion", async () => {
      lrpService.deleteLrpById.mockResolvedValue(mockLrp);

      await request(app).delete("/lrp/1");

      expect(emitOeeUpdate).toHaveBeenCalledWith({
        mesinId: mockLrp.mesinId,
        tanggal: mockLrp.tanggal,
        shiftId: mockLrp.shiftId,
      });
    });

    test("✅ should return message 'LRP deleted successfully'", async () => {
      lrpService.deleteLrpById.mockResolvedValue(mockLrp);
      const res = await request(app).delete("/lrp/1");
      expect(res.body.message).toBe("LRP deleted successfully");
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).delete("/lrp/1");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(lrpService.deleteLrpById).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI (not authorized to delete)", async () => {
      setRole("PRODUKSI");
      const res = await request(app).delete("/lrp/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(lrpService.deleteLrpById).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).delete("/lrp/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).delete("/lrp/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).delete("/lrp/1");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Joi Validation Cases ───────────────────────────────────────────────
    test("❌ should return 400 if lrpId is a non-numeric string", async () => {
      const res = await request(app).delete("/lrp/abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 400 if lrpId is a float", async () => {
      const res = await request(app).delete("/lrp/1.5");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 404 if LRP not found during deletion", async () => {
      lrpService.deleteLrpById.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "LRP not found")
      );

      const res = await request(app).delete("/lrp/999");

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("LRP not found");
    });

    test("❌ should return 500 on database failure during deletion", async () => {
      lrpService.deleteLrpById.mockRejectedValue(new Error("DB_CRASH"));
      const res = await request(app).delete("/lrp/1");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should NOT emit OEE update if deletion service throws", async () => {
      lrpService.deleteLrpById.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "LRP not found")
      );
      await request(app).delete("/lrp/999");
      expect(emitOeeUpdate).not.toHaveBeenCalled();
    });

    test("❌ should return 500 if cascading delete fails (DB FK constraint P2003)", async () => {
      lrpService.deleteLrpById.mockRejectedValue(
        Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" })
      );
      const res = await request(app).delete("/lrp/1");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // 🔴 WORST CASE / EDGE CASE SCENARIOS
  // ===========================================================================
  describe("🔴 Worst Case & Edge Case Scenarios", () => {

    // ── Create Edge Cases ──────────────────────────────────────────────────
    test("create: concurrent duplicate rphId (race condition) → one succeeds, one 409", async () => {
      lrpService.createLrp
        .mockResolvedValueOnce(mockLrp)
        .mockRejectedValueOnce(
          new ApiError(httpStatus.CONFLICT, "LRP for this rphId already exists (Strict 1:1 Mapping)")
        );

      const [res1, res2] = await Promise.all([
        request(app).post("/lrp").send(validCreatePayload),
        request(app).post("/lrp").send(validCreatePayload),
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(httpStatus.CREATED);
      expect(statuses).toContain(httpStatus.CONFLICT);
    });

    test("create: very large qty value (qtyOk = 999999) is accepted", async () => {
      lrpService.createLrp.mockResolvedValue({ ...mockLrp, qtyOk: 999999, qtyTotalProd: 1000005 });
      const res = await request(app).post("/lrp").send({ ...validCreatePayload, qtyOk: 999999 });
      expect(res.status).toBe(httpStatus.CREATED);
    });

    test("create: malformed JSON body returns 400", async () => {
      const res = await request(app)
        .post("/lrp")
        .set("Content-Type", "application/json")
        .send("{ malformed: json }");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("create: OEE emit carries correct mesinId, tanggal, shiftId from service result", async () => {
      const specificLrp = { ...mockLrp, mesinId: 42, tanggal: "2025-06-15T00:00:00.000Z", shiftId: 3 };
      lrpService.createLrp.mockResolvedValue(specificLrp);

      await request(app).post("/lrp").send(validCreatePayload);

      expect(emitOeeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ mesinId: 42, shiftId: 3 })
      );
    });

    // ── GetAll Edge Cases ──────────────────────────────────────────────────
    test("getLrps: very high page number returns empty results gracefully", async () => {
      lrpService.queryLrps.mockResolvedValue({
        results: [], page: 99999, limit: 10, totalPages: 1, totalResults: 5,
      });
      const res = await request(app).get("/lrp?page=99999&limit=10");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.results).toHaveLength(0);
    });

    test("getLrps: handles service returning null results gracefully", async () => {
      lrpService.queryLrps.mockResolvedValue({ results: null, totalResults: 0 });
      const res = await request(app).get("/lrp");
      expect(res.status).toBe(httpStatus.OK);
    });

    test("getLrps: historical date filter (tanggal=2000-01-01) returns 200", async () => {
      lrpService.queryLrps.mockResolvedValue({ results: [], totalResults: 0 });
      const res = await request(app).get("/lrp?tanggal=2000-01-01");
      expect(res.status).toBe(httpStatus.OK);
    });

    // ── GetById Edge Cases ─────────────────────────────────────────────────
    test("getLrp: returns null relation fields gracefully (operator, mesin = null)", async () => {
      lrpService.getLrpById.mockResolvedValue({
        ...mockLrp,
        operator: null,
        mesin: null,
        shift: null,
        rencanaProduksi: null,
      });
      const res = await request(app).get("/lrp/1");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.operator).toBeNull();
    });

    // ── Update Edge Cases ──────────────────────────────────────────────────
    test("update: does NOT emit OEE update when service throws (no partial side-effects)", async () => {
      lrpService.updateLrpById.mockRejectedValue(new Error("DB Fail"));
      await request(app).patch("/lrp/1").send({ statusLrp: "SUBMITTED" });
      expect(emitOeeUpdate).not.toHaveBeenCalled();
    });

    test("update: Prisma unique constraint violation returns 500", async () => {
      lrpService.updateLrpById.mockRejectedValue(
        Object.assign(new Error("Unique constraint violated"), { code: "P2002" })
      );
      const res = await request(app).patch("/lrp/1").send({ statusLrp: "SUBMITTED" });
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    // ── Delete Edge Cases ──────────────────────────────────────────────────
    test("delete: OEE emit carries the deleted LRP's original mesinId/shiftId for recalculation", async () => {
      const deletedLrp = { ...mockLrp, mesinId: 77, tanggal: "2025-03-10T00:00:00.000Z", shiftId: 2 };
      lrpService.deleteLrpById.mockResolvedValue(deletedLrp);

      await request(app).delete("/lrp/1");

      expect(emitOeeUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ mesinId: 77, shiftId: 2 })
      );
    });

    test("delete: cascade LrpLog deletion is handled by service (endpoint returns 200)", async () => {
      lrpService.deleteLrpById.mockResolvedValue(mockLrp);
      const res = await request(app).delete("/lrp/1");
      expect(res.status).toBe(httpStatus.OK);
      expect(lrpService.deleteLrpById).toHaveBeenCalledWith(1);
    });

    // ── General Edge Cases ─────────────────────────────────────────────────
    test("unknown nested route /lrp/unknown/deep/path returns 404", async () => {
      const res = await request(app).get("/lrp/unknown/deep/path");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("unsupported HTTP method (PUT) on /lrp returns 404", async () => {
      const res = await request(app).put("/lrp").send({});
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("Prisma P2037 (connection pool exhausted) on any LRP endpoint returns 500", async () => {
      lrpService.queryLrps.mockRejectedValue(
        Object.assign(new Error("Prisma Client Connection Pool Exhausted"), { code: "P2037" })
      );
      const res = await request(app).get("/lrp");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
