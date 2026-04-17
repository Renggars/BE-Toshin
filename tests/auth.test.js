import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// 1. Global Mock Registry (Shared State for ESM)
global.__MOCKS__ = {
  userService: {
    getUserByNoReg: jest.fn(),
    createUser: jest.fn(),
    getUserByNfc: jest.fn(),
  },
  authService: {
    loginWithNoReg: jest.fn(),
    loginWithNfc: jest.fn(),
  },
  tokenService: {
    generateAuthTokens: jest.fn(),
  },
  rencanaProduksiService: {
    getRencanaProduksiHarian: jest.fn(),
  },
  redis: {
    delByPattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  }
};

// 2. Register Mocks
jest.unstable_mockModule("../src/services/user.service.js", () => ({ default: global.__MOCKS__.userService }));
jest.unstable_mockModule("../src/services/auth.service.js", () => ({ default: global.__MOCKS__.authService }));
jest.unstable_mockModule("../src/services/token.service.js", () => ({ default: global.__MOCKS__.tokenService }));
jest.unstable_mockModule("../src/services/rencanaProduksi.service.js", () => ({ default: global.__MOCKS__.rencanaProduksiService }));
jest.unstable_mockModule("../src/utils/redis.js", () => ({ default: global.__MOCKS__.redis }));

const { default: app } = await import("../src/app.js");
const { default: ApiError } = await import("../src/utils/ApiError.js");

describe("Auth Controller Ultimate Unit Tests", () => {
  const { userService, authService, tokenService, rencanaProduksiService } = global.__MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /auth/register", () => {
    const validUser = {
      nama: "Test User",
      noReg: "REG12345",
      password: "123",
      fk_id_divisi: 1,
      role: "PRODUKSI",
      plant: "1",
      line: "Line 1"
    };

    test("should return 201 on valid registration", async () => {
      userService.getUserByNoReg.mockResolvedValue(null);
      userService.createUser.mockResolvedValue({ id: 1, ...validUser });

      const res = await request(app).post("/auth/register").send(validUser);
      expect(res.status).toBe(httpStatus.CREATED);
      expect(res.body.message).toBe("Registrasi berhasil");
    });

    test("should handle registration with optional fields as null", async () => {
      userService.getUserByNoReg.mockResolvedValue(null);
      userService.createUser.mockResolvedValue({ id: 1, ...validUser, foto_profile: null, no_reg: null });

      const res = await request(app).post("/auth/register").send({ ...validUser, fotoProfile: null });
      expect(res.status).toBe(httpStatus.CREATED);
    });

    test("should return 400 if noReg is already registered", async () => {
      userService.getUserByNoReg.mockResolvedValue({ id: 1 });
      const res = await request(app).post("/auth/register").send(validUser);
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toBe("NoReg sudah terdaftar");
    });

    test("should return 400 if validation fails (e.g., weak password)", async () => {
      const res = await request(app).post("/auth/register").send({ ...validUser, password: "short" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 400 if plant is invalid", async () => {
      const res = await request(app).post("/auth/register").send({ ...validUser, plant: "99" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 500 on unexpected database error during user check", async () => {
      userService.getUserByNoReg.mockRejectedValue(new Error("DB_DOWN"));
      const res = await request(app).post("/auth/register").send(validUser);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /auth/login", () => {
    const loginPayload = { noReg: "REG12345", password: "password123" };
    const nfcPayload = { uidNfc: "12345" };

    test("should login successfully with noReg/password", async () => {
      authService.loginWithNoReg.mockResolvedValue({ id: 1, role: "GA" });
      tokenService.generateAuthTokens.mockResolvedValue({ access: { token: "abc" } });

      const res = await request(app).post("/auth/login").send(loginPayload);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.tokens).toBeDefined();
    });

    test("should login successfully with NFC and fetch dashboard for PRODUKSI", async () => {
      authService.loginWithNfc.mockResolvedValue({ id: 2, role: "PRODUKSI" });
      tokenService.generateAuthTokens.mockResolvedValue({ access: { token: "abc" } });
      rencanaProduksiService.getRencanaProduksiHarian.mockResolvedValue({ plan: "Active" });

      const res = await request(app).post("/auth/login").send(nfcPayload);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.dashboard).toEqual({ plan: "Active" });
    });

    test("should return dashboard: null for non-PRODUKSI roles", async () => {
      authService.loginWithNoReg.mockResolvedValue({ id: 1, role: "MAINTENANCE" });
      tokenService.generateAuthTokens.mockResolvedValue({ access: { token: "abc" } });

      const res = await request(app).post("/auth/login").send(loginPayload);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.dashboard).toBeNull();
      expect(rencanaProduksiService.getRencanaProduksiHarian).not.toHaveBeenCalled();
    });

    test("should be resilient and return login success even if dashboard service fails", async () => {
      authService.loginWithNoReg.mockResolvedValue({ id: 2, role: "PRODUKSI" });
      tokenService.generateAuthTokens.mockResolvedValue({ access: { token: "abc" } });
      rencanaProduksiService.getRencanaProduksiHarian.mockRejectedValue(new Error("Service Unavailable"));

      const res = await request(app).post("/auth/login").send(loginPayload);
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.dashboard).toBeNull();
    });

    test("should return 401 for wrong credentials", async () => {
      authService.loginWithNoReg.mockRejectedValue(new ApiError(httpStatus.UNAUTHORIZED, "Unauthorized"));
      const res = await request(app).post("/auth/login").send(loginPayload);
      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
    });

    test("should return 401 for unknown NFC card", async () => {
      authService.loginWithNfc.mockRejectedValue(new ApiError(httpStatus.UNAUTHORIZED, "Unknown Card"));
      const res = await request(app).post("/auth/login").send(nfcPayload);
      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
    });

    test("should return 403 for suspended account", async () => {
      authService.loginWithNoReg.mockRejectedValue(new ApiError(httpStatus.FORBIDDEN, "Account Suspended"));
      const res = await request(app).post("/auth/login").send(loginPayload);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("should return 400 if neither noReg nor NFC is provided", async () => {
      const res = await request(app).post("/auth/login").send({});
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should return 500 if token generation fails", async () => {
      authService.loginWithNoReg.mockResolvedValue({ id: 1, role: "GA" });
      tokenService.generateAuthTokens.mockRejectedValue(new Error("JWT_ERROR"));
      const res = await request(app).post("/auth/login").send(loginPayload);
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
