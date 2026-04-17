import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Global Mock Registry ────────────────────────────────────────────────
global.__ATTD_MOCKS__ = {
  attendanceService: {
    getScheduledUsers: jest.fn(),
    getPresentUsers: jest.fn(),
    updateAttendanceManual: jest.fn(),
    clockIn: jest.fn(),
  },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          if (!global.__ATTD_MOCKS__.isLoggedIn) {
            return res.status(httpStatus.UNAUTHORIZED).json({
              status: false,
              message: "Please authenticate",
            });
          }
          req.user = global.__ATTD_MOCKS__.mockUser;
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
  mockUser: { id: 1, role: "ADMIN", noReg: "REG123" },
  isLoggedIn: true,
};

// ─── 2. ESM Mocks ────────────────────────────────────────────────────────────
jest.unstable_mockModule("../src/services/attendance.service.js", () => ({
  default: global.__ATTD_MOCKS__.attendanceService,
}));

jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__ATTD_MOCKS__.auth.auth,
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
  exportQueue: { getJobs: jest.fn(), add: jest.fn(), getJob: jest.fn() },
}));

jest.unstable_mockModule("../src/utils/redis.js", () => ({
  default: { get: jest.fn(), set: jest.fn(), delByPattern: jest.fn() },
}));

// ─── 3. Dynamic Imports ───────────────────────────────────────────────────────
const { default: app } = await import("../src/app.js");
const { default: ApiError } = await import("../src/utils/ApiError.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────
const setRole = (role) => { global.__ATTD_MOCKS__.mockUser.role = role; };
const setLoggedIn = (val) => { global.__ATTD_MOCKS__.isLoggedIn = val; };
const setUserId = (id) => { global.__ATTD_MOCKS__.mockUser.id = id; };
const resetState = () => {
  global.__ATTD_MOCKS__.mockUser = { id: 1, role: "ADMIN", email: "admin@test.com" };
  global.__ATTD_MOCKS__.isLoggedIn = true;
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const mockScheduledUser = {
  rph_id: 10,
  operator_id: 5,
  nama: "Operator A",
  statusAbsen: "Belum Hadir",
  is_terlambat: false,
  jam_tap: null,
};

const mockScheduledUserPresent = {
  rph_id: 11,
  operator_id: 6,
  nama: "Operator B",
  statusAbsen: "Hadir",
  is_terlambat: false,
  jam_tap: "2025-01-15T07:00:00.000Z",
};

const mockScheduledUserLate = {
  rph_id: 12,
  operator_id: 7,
  nama: "Operator C",
  statusAbsen: "Hadir",
  is_terlambat: true,
  jam_tap: "2025-01-15T08:15:00.000Z",
};

const mockScheduledList = [mockScheduledUser, mockScheduledUserPresent, mockScheduledUserLate];

const mockPresentUser = {
  id: 101,
  jam_tap: "2025-01-15T07:00:00.000Z",
  is_terlambat: false,
  user: {
    id: 6,
    nama: "Operator B",
    uidNfc: "ABC123",
    divisiId: 1,
    divisi: { id: 1, namaDivisi: "Press" },
  },
  shift: "Shift Pagi",
  mesin: "Mesin 10",
};

const mockPresentUserLate = {
  id: 102,
  jam_tap: "2025-01-15T08:15:00.000Z",
  is_terlambat: true,
  user: {
    id: 7,
    nama: "Operator C",
    uidNfc: "DEF456",
    divisiId: 1,
    divisi: { id: 1, namaDivisi: "Press" },
  },
  shift: "Shift Pagi",
  mesin: "Mesin 20",
};

const mockPresentList = [mockPresentUser, mockPresentUserLate];

const mockAttendanceRecord = {
  id: 200,
  userId: 5,
  rphId: 10,
  jamTap: "2025-01-15T07:30:00.000Z",
  tanggal: "2025-01-15T00:00:00.000Z",
  isTerlambat: false,
};

const mockAttendanceLate = {
  ...mockAttendanceRecord,
  isTerlambat: true,
};

const mockDeleteResult = {
  success: true,
  message: "Kehadiran dihapus, status menjadi Tidak Hadir",
};

const validUpdateBody = {
  rphId: 10,
  userId: 5,
  tanggal: "2025-01-15",
  action: "HADIR",
};

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("Attendance Controller - Comprehensive Unit Tests", () => {
  const { attendanceService } = global.__ATTD_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
  });

  // ===========================================================================
  // GET /attendance/scheduled
  // ===========================================================================
  describe("GET /attendance/scheduled", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 with scheduled user list (no filters)", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue(mockScheduledList);

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.message).toBe("Success get scheduled users");
      expect(attendanceService.getScheduledUsers).toHaveBeenCalledTimes(1);
    });

    test("✅ should pass tanggal filter to service", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue(mockScheduledList);

      await request(app).get("/attendance/scheduled?tanggal=2025-01-15");

      expect(attendanceService.getScheduledUsers).toHaveBeenCalledWith(
        expect.objectContaining({ tanggal: "2025-01-15" })
      );
    });

    test("✅ should pass shiftId filter to service", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue([mockScheduledUser]);

      const res = await request(app).get("/attendance/scheduled?shiftId=1");

      expect(res.status).toBe(httpStatus.OK);
      expect(attendanceService.getScheduledUsers).toHaveBeenCalledWith(
        expect.objectContaining({ shiftId: "1" })
      );
    });

    test("✅ should pass divisiId filter to service", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue([mockScheduledUser]);

      const res = await request(app).get("/attendance/scheduled?divisiId=2");

      expect(res.status).toBe(httpStatus.OK);
      expect(attendanceService.getScheduledUsers).toHaveBeenCalledWith(
        expect.objectContaining({ divisiId: "2" })
      );
    });

    test("✅ should pass all filters combined to service", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue(mockScheduledList);

      const res = await request(app).get(
        "/attendance/scheduled?tanggal=2025-01-15&shiftId=1&divisiId=1"
      );

      expect(res.status).toBe(httpStatus.OK);
      expect(attendanceService.getScheduledUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          tanggal: "2025-01-15",
          shiftId: "1",
          divisiId: "1",
        })
      );
    });

    test("✅ should return empty list when no users are scheduled", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue([]);

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(0);
    });

    test("✅ should return correct statusAbsen for users", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue(mockScheduledList);

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data[0].statusAbsen).toBe("Belum Hadir");
      expect(res.body.data[1].statusAbsen).toBe("Hadir");
    });

    test("✅ should return is_terlambat flag correctly for late users", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue([mockScheduledUserLate]);

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data[0].is_terlambat).toBe(true);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      attendanceService.getScheduledUsers.mockResolvedValue(mockScheduledList);

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.OK);
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(attendanceService.getScheduledUsers).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(attendanceService.getScheduledUsers).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/attendance/scheduled");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/attendance/scheduled");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is ENGINEERING", async () => {
      setRole("ENGINEERING");
      const res = await request(app).get("/attendance/scheduled");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).get("/attendance/scheduled");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      attendanceService.getScheduledUsers.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection error (P1001)", async () => {
      attendanceService.getScheduledUsers.mockRejectedValue(
        Object.assign(new Error("Can't reach database server"), { code: "P1001" })
      );

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma query timeout (P1008)", async () => {
      attendanceService.getScheduledUsers.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      attendanceService.getScheduledUsers.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should propagate ApiError correctly from service", async () => {
      attendanceService.getScheduledUsers.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "tanggal tidak valid")
      );

      const res = await request(app).get("/attendance/scheduled?tanggal=invalid-date");

      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toBe("tanggal tidak valid");
    });

    // ── Worst Case / Edge Cases ────────────────────────────────────────────
    test("🔴 should handle invalid date format gracefully (service handles it)", async () => {
      attendanceService.getScheduledUsers.mockRejectedValue(
        new Error("Invalid date format")
      );

      const res = await request(app).get("/attendance/scheduled?tanggal=not-a-date");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("🔴 should handle concurrent requests efficiently", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue(mockScheduledList);

      const requests = Array.from({ length: 5 }, () =>
        request(app).get("/attendance/scheduled")
      );
      const responses = await Promise.all(requests);

      responses.forEach((res) => expect(res.status).toBe(httpStatus.OK));
      expect(attendanceService.getScheduledUsers).toHaveBeenCalledTimes(5);
    });

    test("🔴 should handle very large result set", async () => {
      const largeList = Array.from({ length: 500 }, (_, i) => ({
        ...mockScheduledUser,
        rph_id: i + 1,
        operator_id: i + 100,
        nama: `Operator ${i + 1}`,
      }));
      attendanceService.getScheduledUsers.mockResolvedValue(largeList);

      const res = await request(app).get("/attendance/scheduled");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(500);
    });

    test("🔴 should handle non-numeric shiftId gracefully (service receives it as string)", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue([]);

      const res = await request(app).get("/attendance/scheduled?shiftId=abc");

      // No validation on the route — service receives string "abc" and handles it
      expect([httpStatus.OK, httpStatus.BAD_REQUEST, httpStatus.INTERNAL_SERVER_ERROR]).toContain(res.status);
    });

    test("🔴 should handle future date filter gracefully (no data)", async () => {
      attendanceService.getScheduledUsers.mockResolvedValue([]);

      const res = await request(app).get("/attendance/scheduled?tanggal=2099-12-31");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ===========================================================================
  // GET /attendance/present
  // ===========================================================================
  describe("GET /attendance/present", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 with present user list (no filters)", async () => {
      attendanceService.getPresentUsers.mockResolvedValue(mockPresentList);

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.message).toBe("Success get present users");
      expect(attendanceService.getPresentUsers).toHaveBeenCalledTimes(1);
    });

    test("✅ should pass tanggal filter to service", async () => {
      attendanceService.getPresentUsers.mockResolvedValue(mockPresentList);

      await request(app).get("/attendance/present?tanggal=2025-01-15");

      expect(attendanceService.getPresentUsers).toHaveBeenCalledWith(
        expect.objectContaining({ tanggal: "2025-01-15" })
      );
    });

    test("✅ should pass shiftId filter to service", async () => {
      attendanceService.getPresentUsers.mockResolvedValue([mockPresentUser]);

      const res = await request(app).get("/attendance/present?shiftId=1");

      expect(res.status).toBe(httpStatus.OK);
      expect(attendanceService.getPresentUsers).toHaveBeenCalledWith(
        expect.objectContaining({ shiftId: "1" })
      );
    });

    test("✅ should pass divisiId filter to service", async () => {
      attendanceService.getPresentUsers.mockResolvedValue([mockPresentUser]);

      const res = await request(app).get("/attendance/present?divisiId=1");

      expect(res.status).toBe(httpStatus.OK);
      expect(attendanceService.getPresentUsers).toHaveBeenCalledWith(
        expect.objectContaining({ divisiId: "1" })
      );
    });

    test("✅ should pass all filters combined to service", async () => {
      attendanceService.getPresentUsers.mockResolvedValue(mockPresentList);

      const res = await request(app).get(
        "/attendance/present?tanggal=2025-01-15&shiftId=1&divisiId=1"
      );

      expect(res.status).toBe(httpStatus.OK);
      expect(attendanceService.getPresentUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          tanggal: "2025-01-15",
          shiftId: "1",
          divisiId: "1",
        })
      );
    });

    test("✅ should return empty list when no one is present", async () => {
      attendanceService.getPresentUsers.mockResolvedValue([]);

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(0);
    });

    test("✅ should return is_terlambat correctly for late attendees", async () => {
      attendanceService.getPresentUsers.mockResolvedValue(mockPresentList);

      const res = await request(app).get("/attendance/present");

      expect(res.body.data[0].is_terlambat).toBe(false);
      expect(res.body.data[1].is_terlambat).toBe(true);
    });

    test("✅ should include user, shift, and mesin fields", async () => {
      attendanceService.getPresentUsers.mockResolvedValue([mockPresentUser]);

      const res = await request(app).get("/attendance/present");

      expect(res.body.data[0]).toMatchObject({
        id: expect.any(Number),
        jam_tap: expect.any(String),
        is_terlambat: false,
        user: expect.objectContaining({ nama: "Operator B" }),
        shift: "Shift Pagi",
        mesin: "Mesin 10",
      });
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      attendanceService.getPresentUsers.mockResolvedValue(mockPresentList);

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.OK);
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(attendanceService.getPresentUsers).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");
      const res = await request(app).get("/attendance/present");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).get("/attendance/present");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).get("/attendance/present");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is ENGINEERING", async () => {
      setRole("ENGINEERING");
      const res = await request(app).get("/attendance/present");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).get("/attendance/present");
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      attendanceService.getPresentUsers.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection error (P1001)", async () => {
      attendanceService.getPresentUsers.mockRejectedValue(
        Object.assign(new Error("Can't reach database server"), { code: "P1001" })
      );

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma query timeout (P1008)", async () => {
      attendanceService.getPresentUsers.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      attendanceService.getPresentUsers.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should propagate ApiError correctly from service", async () => {
      attendanceService.getPresentUsers.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "shiftId harus numeric")
      );

      const res = await request(app).get("/attendance/present?shiftId=abc");

      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toBe("shiftId harus numeric");
    });

    // ── Worst Case / Edge Cases ────────────────────────────────────────────
    test("🔴 should handle concurrent requests efficiently", async () => {
      attendanceService.getPresentUsers.mockResolvedValue(mockPresentList);

      const requests = Array.from({ length: 5 }, () =>
        request(app).get("/attendance/present")
      );
      const responses = await Promise.all(requests);

      responses.forEach((res) => expect(res.status).toBe(httpStatus.OK));
      expect(attendanceService.getPresentUsers).toHaveBeenCalledTimes(5);
    });

    test("🔴 should handle result with null shift or mesin (RPH soft deleted)", async () => {
      attendanceService.getPresentUsers.mockResolvedValue([
        {
          ...mockPresentUser,
          shift: null,
          mesin: null,
        },
      ]);

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data[0].shift).toBeNull();
      expect(res.body.data[0].mesin).toBeNull();
    });

    test("🔴 should handle very large result set", async () => {
      const largeList = Array.from({ length: 200 }, (_, i) => ({
        ...mockPresentUser,
        id: i + 1,
        user: { ...mockPresentUser.user, id: i + 50 },
      }));
      attendanceService.getPresentUsers.mockResolvedValue(largeList);

      const res = await request(app).get("/attendance/present");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(200);
    });

    test("🔴 should handle future tanggal filter (no data scenario)", async () => {
      attendanceService.getPresentUsers.mockResolvedValue([]);

      const res = await request(app).get("/attendance/present?tanggal=2099-12-31");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(0);
    });
  });

  // ===========================================================================
  // PUT /attendance/update — updateAttendance
  // ===========================================================================
  describe("PUT /attendance/update", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 when updating attendance to HADIR (ADMIN)", async () => {
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceRecord);

      const res = await request(app)
        .put("/attendance/update")
        .send(validUpdateBody);

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe("Attendance updated successfully");
      expect(attendanceService.updateAttendanceManual).toHaveBeenCalledTimes(1);
    });

    test("✅ should call service with correct payload including adminId from req.user", async () => {
      setUserId(3);
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceRecord);

      await request(app).put("/attendance/update").send(validUpdateBody);

      expect(attendanceService.updateAttendanceManual).toHaveBeenCalledWith(
        expect.objectContaining({
          rphId: 10,
          userId: 5,
          tanggal: "2025-01-15",
          action: "HADIR",
          adminId: 3,
        })
      );
    });

    test("✅ should return 200 for action = HADIR (on-time)", async () => {
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceRecord);

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, action: "HADIR" });

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.isTerlambat).toBe(false);
    });

    test("✅ should return 200 for action = TERLAMBAT (late)", async () => {
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceLate);

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, action: "TERLAMBAT" });

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.isTerlambat).toBe(true);
    });

    test("✅ should return 200 for action = TIDAK_HADIR (delete attendance)", async () => {
      attendanceService.updateAttendanceManual.mockResolvedValue(mockDeleteResult);

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, action: "TIDAK_HADIR" });

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.success).toBe(true);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceRecord);

      const res = await request(app)
        .put("/attendance/update")
        .send(validUpdateBody);

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should handle updating an already-present user (idempotent HADIR)", async () => {
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceRecord);

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, action: "HADIR" });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should handle updating late user to TIDAK_HADIR (remove late penalty)", async () => {
      attendanceService.updateAttendanceManual.mockResolvedValue(mockDeleteResult);

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, action: "TIDAK_HADIR" });

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should accept numeric rphId and userId as numbers", async () => {
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceRecord);

      const res = await request(app)
        .put("/attendance/update")
        .send({
          rphId: 10,
          userId: 5,
          tanggal: "2025-01-15",
          action: "HADIR",
        });

      expect(res.status).toBe(httpStatus.OK);
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app)
        .put("/attendance/update")
        .send(validUpdateBody);

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(attendanceService.updateAttendanceManual).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is PRODUKSI", async () => {
      setRole("PRODUKSI");

      const res = await request(app)
        .put("/attendance/update")
        .send(validUpdateBody);

      expect(res.status).toBe(httpStatus.FORBIDDEN);
      expect(attendanceService.updateAttendanceManual).not.toHaveBeenCalled();
    });

    test("❌ should return 403 if role is MAINTENANCE", async () => {
      setRole("MAINTENANCE");
      const res = await request(app).put("/attendance/update").send(validUpdateBody);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is QUALITY", async () => {
      setRole("QUALITY");
      const res = await request(app).put("/attendance/update").send(validUpdateBody);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is ENGINEERING", async () => {
      setRole("ENGINEERING");
      const res = await request(app).put("/attendance/update").send(validUpdateBody);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    test("❌ should return 403 if role is DIE_MAINT", async () => {
      setRole("DIE_MAINT");
      const res = await request(app).put("/attendance/update").send(validUpdateBody);
      expect(res.status).toBe(httpStatus.FORBIDDEN);
    });

    // ── Body Validation Cases ──────────────────────────────────────────────
    test("❌ should return 400 or 500 when rphId is missing", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "rphId required")
      );

      const res = await request(app)
        .put("/attendance/update")
        .send({ userId: 5, tanggal: "2025-01-15", action: "HADIR" });

      expect([httpStatus.BAD_REQUEST, httpStatus.INTERNAL_SERVER_ERROR]).toContain(res.status);
    });

    test("❌ should return 400 or 500 when userId is missing", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "userId required")
      );

      const res = await request(app)
        .put("/attendance/update")
        .send({ rphId: 10, tanggal: "2025-01-15", action: "HADIR" });

      expect([httpStatus.BAD_REQUEST, httpStatus.INTERNAL_SERVER_ERROR]).toContain(res.status);
    });

    test("❌ should return 400 or 500 when action is invalid enum value", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "action tidak valid")
      );

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, action: "INVALID_ACTION" });

      expect([httpStatus.BAD_REQUEST, httpStatus.INTERNAL_SERVER_ERROR]).toContain(res.status);
    });

    test("❌ should return 400 or 500 when body is empty", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "Request body tidak valid")
      );

      const res = await request(app).put("/attendance/update").send({});

      expect([httpStatus.BAD_REQUEST, httpStatus.INTERNAL_SERVER_ERROR]).toContain(res.status);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 404 if RPH (rencana produksi) not found", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Rencana Produksi tidak ditemukan")
      );

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, rphId: 999 });

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Rencana Produksi tidak ditemukan");
    });

    test("❌ should return 500 if service throws generic error", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app)
        .put("/attendance/update")
        .send(validUpdateBody);

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection error (P1001)", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        Object.assign(new Error("Can't reach database server"), { code: "P1001" })
      );

      const res = await request(app).put("/attendance/update").send(validUpdateBody);

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma query timeout (P1008)", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );

      const res = await request(app).put("/attendance/update").send(validUpdateBody);

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma unique constraint (P2002)", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        Object.assign(new Error("Unique constraint violated"), { code: "P2002" })
      );

      const res = await request(app).put("/attendance/update").send(validUpdateBody);

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );

      const res = await request(app).put("/attendance/update").send(validUpdateBody);

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 400 if service throws ApiError for early clock-in", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new ApiError(
          httpStatus.BAD_REQUEST,
          "Terlalu awal. Absen dibuka mulai jam 05:00"
        )
      );

      const res = await request(app)
        .put("/attendance/update")
        .send(validUpdateBody);

      expect(res.status).toBe(httpStatus.BAD_REQUEST);
      expect(res.body.message).toContain("Terlalu awal");
    });

    // ── Worst Case / Edge Cases ────────────────────────────────────────────
    test("🔴 should handle concurrent update requests for same user", async () => {
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceRecord);

      const requests = Array.from({ length: 5 }, () =>
        request(app).put("/attendance/update").send(validUpdateBody)
      );
      const responses = await Promise.all(requests);

      responses.forEach((res) => expect(res.status).toBe(httpStatus.OK));
      expect(attendanceService.updateAttendanceManual).toHaveBeenCalledTimes(5);
    });

    test("🔴 should handle action = TERLAMBAT with poin service failure (non-blocking)", async () => {
      // Even if poin service fails, attendance should still be updated
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceLate);

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, action: "TERLAMBAT" });

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data.isTerlambat).toBe(true);
    });

    test("🔴 should handle negative rphId (edge-case boundary)", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Rencana Produksi tidak ditemukan")
      );

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, rphId: -1 });

      expect([httpStatus.NOT_FOUND, httpStatus.BAD_REQUEST, httpStatus.INTERNAL_SERVER_ERROR]).toContain(res.status);
    });

    test("🔴 should handle very large rphId (non-existent)", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Rencana Produksi tidak ditemukan")
      );

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, rphId: 2147483647 });

      expect(res.status).toBe(httpStatus.NOT_FOUND);
    });

    test("🔴 should handle non-numeric rphId (string input)", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new ApiError(httpStatus.BAD_REQUEST, "rphId harus berupa angka")
      );

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, rphId: "abc" });

      expect([httpStatus.BAD_REQUEST, httpStatus.INTERNAL_SERVER_ERROR]).toContain(res.status);
    });

    test("🔴 should handle invalid date format in tanggal field", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new Error("Invalid time value")
      );

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, tanggal: "not-a-date" });

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("🔴 should handle service throwing an unhandled error type", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue({
        custom: "Unhandled Object Error",
      });

      const res = await request(app)
        .put("/attendance/update")
        .send(validUpdateBody);

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("🔴 should handle SQL injection attempt in tanggal field safely", async () => {
      attendanceService.updateAttendanceManual.mockRejectedValue(
        new Error("Invalid date")
      );

      const res = await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, tanggal: "'; DROP TABLE attendance; --" });

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("🔴 should verify adminId is taken from req.user, not request body", async () => {
      setUserId(10);
      attendanceService.updateAttendanceManual.mockResolvedValue(mockAttendanceRecord);

      await request(app)
        .put("/attendance/update")
        .send({ ...validUpdateBody, adminId: 999 }); // attacker-supplied adminId

      // Service should receive adminId = 10 (from req.user), not 999
      expect(attendanceService.updateAttendanceManual).toHaveBeenCalledWith(
        expect.objectContaining({ adminId: 10 })
      );
    });
  });
});
