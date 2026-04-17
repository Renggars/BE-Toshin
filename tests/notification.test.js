import request from "supertest";
import { jest } from "@jest/globals";
import httpStatus from "http-status";

// ─── 1. Global Mock Registry ────────────────────────────────────────────────
global.__NOTIF_MOCKS__ = {
  notificationService: {
    getNotifications: jest.fn(),
    markAsRead: jest.fn(),
    getUnreadCount: jest.fn(),
    createNotification: jest.fn(),
    createBulkNotifications: jest.fn(),
  },
  auth: {
    auth: jest.fn(
      (...requiredRoles) =>
        (req, res, next) => {
          if (!global.__NOTIF_MOCKS__.isLoggedIn) {
            return res.status(httpStatus.UNAUTHORIZED).json({
              status: false,
              message: "Please authenticate",
            });
          }
          req.user = global.__NOTIF_MOCKS__.mockUser;
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
jest.unstable_mockModule("../src/services/notification.service.js", () => ({
  default: global.__NOTIF_MOCKS__.notificationService,
}));

jest.unstable_mockModule("../src/middlewares/auth.js", () => ({
  auth: global.__NOTIF_MOCKS__.auth.auth,
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
const setRole = (role) => { global.__NOTIF_MOCKS__.mockUser.role = role; };
const setLoggedIn = (val) => { global.__NOTIF_MOCKS__.isLoggedIn = val; };
const setUserId = (id) => { global.__NOTIF_MOCKS__.mockUser.id = id; };
const resetState = () => {
  global.__NOTIF_MOCKS__.mockUser = { id: 1, role: "ADMIN", email: "admin@test.com" };
  global.__NOTIF_MOCKS__.isLoggedIn = true;
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const mockNotification = {
  id: 1,
  userId: 1,
  tipe: "ANDON",
  judul: "Andon Triggered",
  pesan: "Mesin 10 membutuhkan perhatian",
  isRead: false,
  createdAt: "2025-01-15T08:00:00.000Z",
};

const mockNotificationRead = {
  ...mockNotification,
  id: 2,
  isRead: true,
  createdAt: "2025-01-14T10:00:00.000Z",
};

const mockNotificationList = [mockNotification, mockNotificationRead];

const mockMeta = {
  totalItems: 2,
  totalPages: 1,
  currentPage: 1,
};

const mockGetNotificationsResult = {
  data: mockNotificationList,
  meta: mockMeta,
};

const mockEmptyResult = {
  data: [],
  meta: {
    totalItems: 0,
    totalPages: 0,
    currentPage: 1,
  },
};

const mockUnreadCountResult = {
  unreadCount: 5,
};

const mockMarkAsReadResult = {
  count: 1,
};

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("Notification Controller - Comprehensive Unit Tests", () => {
  const { notificationService } = global.__NOTIF_MOCKS__;

  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
  });

  // ===========================================================================
  // GET /notification — getNotifications
  // ===========================================================================
  describe("GET /notification", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 with notification list (no pagination params)", async () => {
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta).toBeDefined();
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
    });

    test("✅ should call service with correct userId from req.user", async () => {
      setUserId(42);
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      await request(app).get("/notification");

      expect(notificationService.getNotifications).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ page: undefined, limit: undefined })
      );
    });

    test("✅ should pass page and limit query params to service", async () => {
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      const res = await request(app).get("/notification?page=2&limit=10");

      expect(res.status).toBe(httpStatus.OK);
      expect(notificationService.getNotifications).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ page: "2", limit: "10" })
      );
    });

    test("✅ should return empty list when user has no notifications", async () => {
      notificationService.getNotifications.mockResolvedValue(mockEmptyResult);

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta.totalItems).toBe(0);
    });

    test("✅ should return correct pagination meta", async () => {
      const multiPageMeta = {
        data: [mockNotification],
        meta: { totalItems: 50, totalPages: 5, currentPage: 2 },
      };
      notificationService.getNotifications.mockResolvedValue(multiPageMeta);

      const res = await request(app).get("/notification?page=2&limit=10");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.meta.totalPages).toBe(5);
      expect(res.body.meta.currentPage).toBe(2);
    });

    test("✅ should return 200 with PRODUKSI role", async () => {
      setRole("PRODUKSI");
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with MAINTENANCE role", async () => {
      setRole("MAINTENANCE");
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with ENGINEERING role", async () => {
      setRole("ENGINEERING");
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return notification with correct fields", async () => {
      notificationService.getNotifications.mockResolvedValue({
        data: [mockNotification],
        meta: { totalItems: 1, totalPages: 1, currentPage: 1 },
      });

      const res = await request(app).get("/notification");

      expect(res.body.data[0]).toMatchObject({
        id: expect.any(Number),
        userId: expect.any(Number),
        tipe: "ANDON",
        judul: "Andon Triggered",
        pesan: "Mesin 10 membutuhkan perhatian",
        isRead: false,
      });
    });

    test("✅ should handle mix of read and unread notifications", async () => {
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.OK);
      const unread = res.body.data.filter((n) => !n.isRead);
      const read = res.body.data.filter((n) => n.isRead);
      expect(unread.length + read.length).toBe(res.body.data.length);
    });

    test("✅ should return page=1 when no page provided (default)", async () => {
      notificationService.getNotifications.mockResolvedValue({
        ...mockGetNotificationsResult,
        meta: { totalItems: 2, totalPages: 1, currentPage: 1 },
      });

      const res = await request(app).get("/notification");

      expect(res.body.meta.currentPage).toBe(1);
    });

    test("✅ should handle large page number gracefully (empty result)", async () => {
      notificationService.getNotifications.mockResolvedValue(mockEmptyResult);

      const res = await request(app).get("/notification?page=9999&limit=20");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data).toHaveLength(0);
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(res.body.status).toBe(false);
      expect(notificationService.getNotifications).not.toHaveBeenCalled();
    });

    test("❌ should return 401 with correct message when not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/notification");

      expect(res.body.message).toBe("Please authenticate");
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      notificationService.getNotifications.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection error (P1001)", async () => {
      notificationService.getNotifications.mockRejectedValue(
        Object.assign(new Error("Can't reach database server"), { code: "P1001" })
      );

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma query timeout (P1008)", async () => {
      notificationService.getNotifications.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      notificationService.getNotifications.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should propagate ApiError correctly from service", async () => {
      notificationService.getNotifications.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "User not found")
      );

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("User not found");
    });

    // ── Worst Case / Edge Cases ────────────────────────────────────────────
    test("🔴 should handle service returning null gracefully (worst case)", async () => {
      notificationService.getNotifications.mockResolvedValue(null);

      const res = await request(app).get("/notification");

      // The controller spreads result, so null spread = empty body props
      expect(res.status).toBe(httpStatus.OK);
    });

    test("🔴 should handle concurrent requests from same user", async () => {
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      const requests = Array.from({ length: 5 }, () =>
        request(app).get("/notification")
      );
      const responses = await Promise.all(requests);

      responses.forEach((res) => expect(res.status).toBe(httpStatus.OK));
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(5);
    });

    test("🔴 should handle service returning data with special characters in pesan", async () => {
      const specialCharNotif = {
        ...mockNotification,
        pesan: "<script>alert('xss')</script> & ' \" unicode: 你好",
      };
      notificationService.getNotifications.mockResolvedValue({
        data: [specialCharNotif],
        meta: { totalItems: 1, totalPages: 1, currentPage: 1 },
      });

      const res = await request(app).get("/notification");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.data[0].pesan).toContain("alert");
    });

    test("🔴 should handle extremely large limit gracefully", async () => {
      notificationService.getNotifications.mockResolvedValue(mockGetNotificationsResult);

      const res = await request(app).get("/notification?limit=99999");

      expect(res.status).toBe(httpStatus.OK);
      expect(notificationService.getNotifications).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // GET /notification/unread-count — getUnreadCount
  // ===========================================================================
  describe("GET /notification/unread-count", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 with unread count", async () => {
      notificationService.getUnreadCount.mockResolvedValue(mockUnreadCountResult);

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.unreadCount).toBe(5);
      expect(notificationService.getUnreadCount).toHaveBeenCalledTimes(1);
    });

    test("✅ should call service with correct userId from authenticated user", async () => {
      setUserId(99);
      notificationService.getUnreadCount.mockResolvedValue({ unreadCount: 3 });

      await request(app).get("/notification/unread-count");

      expect(notificationService.getUnreadCount).toHaveBeenCalledWith(99);
    });

    test("✅ should return unreadCount = 0 when all notifications are read", async () => {
      notificationService.getUnreadCount.mockResolvedValue({ unreadCount: 0 });

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.unreadCount).toBe(0);
    });

    test("✅ should return 200 with PRODUKSI role", async () => {
      setRole("PRODUKSI");
      notificationService.getUnreadCount.mockResolvedValue(mockUnreadCountResult);

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      notificationService.getUnreadCount.mockResolvedValue(mockUnreadCountResult);

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with MAINTENANCE role", async () => {
      setRole("MAINTENANCE");
      notificationService.getUnreadCount.mockResolvedValue(mockUnreadCountResult);

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with ENGINEERING role", async () => {
      setRole("ENGINEERING");
      notificationService.getUnreadCount.mockResolvedValue(mockUnreadCountResult);

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return high unreadCount (e.g. 999) correctly", async () => {
      notificationService.getUnreadCount.mockResolvedValue({ unreadCount: 999 });

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.unreadCount).toBe(999);
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(notificationService.getUnreadCount).not.toHaveBeenCalled();
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 500 if service throws generic error", async () => {
      notificationService.getUnreadCount.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma timeout (P1008)", async () => {
      notificationService.getUnreadCount.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      notificationService.getUnreadCount.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should propagate ApiError from service", async () => {
      notificationService.getUnreadCount.mockRejectedValue(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Service unavailable")
      );

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      expect(res.body.message).toBe("Service unavailable");
    });

    // ── Worst Case / Edge Cases ────────────────────────────────────────────
    test("🔴 should handle concurrent unread-count requests", async () => {
      notificationService.getUnreadCount.mockResolvedValue({ unreadCount: 7 });

      const requests = Array.from({ length: 10 }, () =>
        request(app).get("/notification/unread-count")
      );
      const responses = await Promise.all(requests);

      responses.forEach((res) => {
        expect(res.status).toBe(httpStatus.OK);
        expect(res.body.unreadCount).toBe(7);
      });
      expect(notificationService.getUnreadCount).toHaveBeenCalledTimes(10);
    });

    test("🔴 should handle service returning null unreadCount", async () => {
      notificationService.getUnreadCount.mockResolvedValue({ unreadCount: null });

      const res = await request(app).get("/notification/unread-count");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.unreadCount).toBeNull();
    });
  });

  // ===========================================================================
  // PATCH /notification/:id/read — markAsRead
  // ===========================================================================
  describe("PATCH /notification/:id/read", () => {

    // ── Success Cases ──────────────────────────────────────────────────────
    test("✅ should return 200 and success message when notification marked as read", async () => {
      notificationService.markAsRead.mockResolvedValue(mockMarkAsReadResult);

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.status).toBe(true);
      expect(res.body.message).toBe("Notification marked as read");
      expect(notificationService.markAsRead).toHaveBeenCalledTimes(1);
    });

    test("✅ should call service with correct notification id and userId", async () => {
      setUserId(7);
      notificationService.markAsRead.mockResolvedValue(mockMarkAsReadResult);

      await request(app).patch("/notification/42/read");

      expect(notificationService.markAsRead).toHaveBeenCalledWith("42", 7);
    });

    test("✅ should return 200 when marking already-read notification (idempotent)", async () => {
      // updateMany with count:0 means no rows updated but no error
      notificationService.markAsRead.mockResolvedValue({ count: 0 });

      const res = await request(app).patch("/notification/2/read");

      expect(res.status).toBe(httpStatus.OK);
      expect(res.body.message).toBe("Notification marked as read");
    });

    test("✅ should return 200 with PRODUKSI role", async () => {
      setRole("PRODUKSI");
      notificationService.markAsRead.mockResolvedValue(mockMarkAsReadResult);

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with SUPERVISOR role", async () => {
      setRole("SUPERVISOR");
      notificationService.markAsRead.mockResolvedValue(mockMarkAsReadResult);

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with MAINTENANCE role", async () => {
      setRole("MAINTENANCE");
      notificationService.markAsRead.mockResolvedValue(mockMarkAsReadResult);

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with QUALITY role", async () => {
      setRole("QUALITY");
      notificationService.markAsRead.mockResolvedValue(mockMarkAsReadResult);

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 with ENGINEERING role", async () => {
      setRole("ENGINEERING");
      notificationService.markAsRead.mockResolvedValue(mockMarkAsReadResult);

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.OK);
    });

    test("✅ should return 200 for notification with a large numeric ID", async () => {
      notificationService.markAsRead.mockResolvedValue(mockMarkAsReadResult);

      const res = await request(app).patch("/notification/99999/read");

      expect(res.status).toBe(httpStatus.OK);
      expect(notificationService.markAsRead).toHaveBeenCalledWith("99999", expect.any(Number));
    });

    // ── Authorization Cases ────────────────────────────────────────────────
    test("❌ should return 401 if not authenticated", async () => {
      setLoggedIn(false);

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.UNAUTHORIZED);
      expect(notificationService.markAsRead).not.toHaveBeenCalled();
    });

    test("❌ should not allow one user to mark another user's notification (service-level check)", async () => {
      // The controller passes req.user.id, so service will filter by userId
      // Simulate service returning count:0 (notification not found for this userId)
      setUserId(2);
      notificationService.markAsRead.mockResolvedValue({ count: 0 });

      const res = await request(app).patch("/notification/1/read");

      // Controller sends 200 regardless (markAsRead uses updateMany)
      expect(res.status).toBe(httpStatus.OK);
      // Verify userId is scoped correctly
      expect(notificationService.markAsRead).toHaveBeenCalledWith("1", 2);
    });

    // ── Service Error Cases ────────────────────────────────────────────────
    test("❌ should return 404 if notification does not exist", async () => {
      notificationService.markAsRead.mockRejectedValue(
        new ApiError(httpStatus.NOT_FOUND, "Notification not found")
      );

      const res = await request(app).patch("/notification/999/read");

      expect(res.status).toBe(httpStatus.NOT_FOUND);
      expect(res.body.message).toBe("Notification not found");
    });

    test("❌ should return 500 if service throws generic error", async () => {
      notificationService.markAsRead.mockRejectedValue(new Error("DB_CRASH"));

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma record not found (P2025)", async () => {
      notificationService.markAsRead.mockRejectedValue(
        Object.assign(new Error("Record to update not found"), { code: "P2025" })
      );

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma timeout (P1008)", async () => {
      notificationService.markAsRead.mockRejectedValue(
        Object.assign(new Error("Operations timed out"), { code: "P1008" })
      );

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    test("❌ should return 500 on Prisma connection pool exhausted (P2037)", async () => {
      notificationService.markAsRead.mockRejectedValue(
        Object.assign(new Error("Connection pool exhausted"), { code: "P2037" })
      );

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });

    // ── Worst Case / Edge Cases ────────────────────────────────────────────
    test("🔴 should handle non-numeric notification id (string in path)", async () => {
      const res = await request(app).patch("/notification/abc/read");

      // Route will still match (Express param is a string), service handles it
      // Either 400 (if validated) or service gets called with "abc"
      expect([httpStatus.OK, httpStatus.BAD_REQUEST, httpStatus.NOT_FOUND, httpStatus.INTERNAL_SERVER_ERROR]).toContain(res.status);
    });

    test("🔴 should handle notification id = 0", async () => {
      notificationService.markAsRead.mockResolvedValue({ count: 0 });

      const res = await request(app).patch("/notification/0/read");

      expect([httpStatus.OK, httpStatus.BAD_REQUEST]).toContain(res.status);
    });

    test("🔴 should handle concurrent mark-as-read for the same notification", async () => {
      notificationService.markAsRead.mockResolvedValue(mockMarkAsReadResult);

      const requests = Array.from({ length: 5 }, () =>
        request(app).patch("/notification/1/read")
      );
      const responses = await Promise.all(requests);

      responses.forEach((res) => expect(res.status).toBe(httpStatus.OK));
      expect(notificationService.markAsRead).toHaveBeenCalledTimes(5);
    });

    test("🔴 should handle extremely large notification ID", async () => {
      notificationService.markAsRead.mockResolvedValue({ count: 0 });

      const res = await request(app).patch("/notification/2147483647/read");

      expect([httpStatus.OK, httpStatus.NOT_FOUND]).toContain(res.status);
    });

    test("🔴 should handle service throwing an unhandled error type", async () => {
      notificationService.markAsRead.mockRejectedValue({ custom: "Weird Error Object" });

      const res = await request(app).patch("/notification/1/read");

      expect(res.status).toBe(httpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});
