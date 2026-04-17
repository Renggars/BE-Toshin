import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Global Mock Registry ────────────────────────────────────────────────
global.__USER_MOCKS__ = {
  userService: {
    queryUsers: jest.fn(),
    getUserById: jest.fn(),
    getUserByNoReg: jest.fn(),
    updateUserById: jest.fn(),
    deactivateUserById: jest.fn(),
    getCurrentUserData: jest.fn(),
    createUser: jest.fn(),
  },
  mockUser: { id: 1, role: "ADMIN", noReg: "REG123" },
  auth: {
    auth: jest.fn((...requiredRoles) => (req, res, next) => {
      if (!global.__USER_MOCKS__.isLoggedIn) {
        return res.status(httpStatus.UNAUTHORIZED).json({
          status: false,
          message: "Please authenticate",
        });
      }
      req.user = global.__USER_MOCKS__.mockUser;
      if (requiredRoles.length && !requiredRoles.includes(req.user.role)) {
        return res.status(httpStatus.FORBIDDEN).json({
          status: false,
          message: "Forbidden: You do not have the required role",
        });
      }
      next();
    }),
  },
  redis: {
    delByPattern: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
  },
  isLoggedIn: true,
};

// ─── 2. Register ESM Mocks ───────────────────────────────────────────────────
jest.unstable_mockModule("../src/services/user.service.js", () => ({
  default: global.__USER_MOCKS__.userService,
}));
jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__USER_MOCKS__.auth.auth,
}));
jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: global.__USER_MOCKS__.redis,
}));

// ─── 3. Import App & Utilities ───────────────────────────────────────────────
const { default: app } = await import("../src/app.js");
const { default: ApiError } = await import("../src/utils/ApiError.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────
const setRole = (role) => {
  global.__USER_MOCKS__.mockUser.role = role;
};
const setLoggedIn = (val) => {
  global.__USER_MOCKS__.isLoggedIn = val;
};

describe("User Controller - Comprehensive Unit Tests", () => {
  const { userService } = global.__USER_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    setRole("ADMIN");
    setLoggedIn(true);
  });

  // ===========================================================================
  // GET /user
  // ===========================================================================
  describe("GET /user", () => {
    test("✅ should return 200 and users list for ADMIN", async () => {
      const mockUsers = [{ id: 1, nama: "User 1" }];
      userService.queryUsers.mockResolvedValue(mockUsers);

      const res = await request(app).get("/user");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual(mockUsers);
      expect(userService.queryUsers).toHaveBeenCalled();
    });

    test("❌ should return 401 if not logged in", async () => {
      setLoggedIn(false);
      const res = await request(app).get("/user");
      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
    });

    test("❌ should return 403 if role is not ADMIN/SUPERVISOR", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get("/user");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 500 if service fails", async () => {
      userService.queryUsers.mockRejectedValue(new Error("DB Error"));
      const res = await request(app).get("/user");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });


  // ===========================================================================
  // GET /user/:userId
  // ===========================================================================
  describe("GET /user/:userId", () => {
    test("✅ should return 200 and user data for existing ID", async () => {
      const mockUser = { id: 10, nama: "Found User" };
      userService.getUserById.mockResolvedValue(mockUser);

      const res = await request(app).get("/user/10");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toEqual(mockUser);
    });

    test("❌ should return 404 if user not found", async () => {
      userService.getUserById.mockRejectedValue(new ApiError(httpStatus.NOT_FOUND, "User not found"));
      const res = await request(app).get("/user/999");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("❌ should return 400 if userId is not a number", async () => {
      const res = await request(app).get("/user/abc");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });
  });

  // ===========================================================================
  // PUT /user/:userId
  // ===========================================================================
  describe("PUT /user/:userId", () => {
    const updateData = { nama: "Updated Name" };

    test("✅ should return 200 on successful update", async () => {
      userService.updateUserById.mockResolvedValue({ id: 10, ...updateData });

      const res = await request(app).put("/user/10").send(updateData);

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.nama).toBe("Updated Name");
    });

    test("❌ should return 400 if NFC UID is already taken by another user", async () => {
      userService.updateUserById.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "UID NFC sudah digunakan oleh user lain")
      );
      const res = await request(app).put("/user/10").send({ uidNfc: "123" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toMatch(/UID NFC/);
    });

    test("❌ should return 400 if validation fails (e.g. invalid role)", async () => {
      const res = await request(app).put("/user/10").send({ role: "INVALID_ROLE" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("❌ should return 404 if user to update does not exist", async () => {
      userService.updateUserById.mockRejectedValue(new ApiError(httpStatus.NOT_FOUND, "User not found"));
      const res = await request(app).put("/user/999").send({ nama: "Ghost" });
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });
  });

  // ===========================================================================
  // PUT /user/:userId/deactivate
  // ===========================================================================
  describe("PUT /user/:userId/deactivate", () => {
    test("✅ should return 200 on successful deactivation", async () => {
      userService.deactivateUserById.mockResolvedValue({ id: 10, status: "inactive" });

      const res = await request(app).put("/user/10/deactivate");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.status).toBe("inactive");
    });

    test("❌ should return 404 if user not found", async () => {
      userService.deactivateUserById.mockRejectedValue(new ApiError(httpStatus.NOT_FOUND, "User not found"));
      const res = await request(app).put("/user/999/deactivate");
      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("❌ should return 500 on database failure", async () => {
      userService.deactivateUserById.mockRejectedValue(new Error("DB FAIL"));
      const res = await request(app).put("/user/10/deactivate");
      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  // ===========================================================================
  // 🔴 WORST CASE / EDGE CASE SCENARIOS
  // ===========================================================================
  describe("🔴 Worst Case Scenarios", () => {
    test("should handle concurrent NFC update clash at DB level", async () => {
      userService.updateUserById.mockRejectedValue(new ApiError(httpStatus.BAD_REQUEST, "Unique constraint failed"));
      const res = await request(app).put("/user/10").send({ uidNfc: "duplicate" });
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });

    test("should handle large payload gracefully", async () => {
      const largeData = { nama: "A".repeat(10000) };
      const res = await request(app).put("/user/10").send(largeData);
      expect(res.status).toBeLessThan(500); 
    });

    test("should handle service returning null for getUsers", async () => {
      userService.queryUsers.mockResolvedValue(null);
      const res = await request(app).get("/user");
      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toBeNull();
    });

    test("should handle malformed JSON in PUT request", async () => {
      const res = await request(app)
        .put("/user/10")
        .set("Content-Type", "application/json")
        .send("{ malformed: json ");
      expect(res.status).toBe(httpStatus.BAD_REQUEST);
    });
  });
});
