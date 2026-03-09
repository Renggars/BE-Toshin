import { Server } from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import logger from "./logger.js";

let io = null;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: ["https://admin.socket.io", "*"],
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    },
  });

  // Enable Socket.io Admin UI
  instrument(io, {
    auth: false, // Set true and add password for production
    mode: "development",
  });

  io.on("connection", (socket) => {
    logger.info(`New client connected: ${socket.id}`);

    // Emit notifikasi baru ke client spesifik
    socket.on("join", (userId) => {
      socket.join(`user:${userId}`);
      logger.info(`Socket ${socket.id} joined room user: ${userId}`);
    });

    socket.on("disconnect", () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  logger.info("Socket.io initialized");
  return io;
};

export const getIo = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

/**
 * Emit event real-time update untuk Andon system
 * @param {Object} data Andon event data
 */
export const emitAndonUpdate = (data) => {
  try {
    const ioInstance = getIo();
    ioInstance.emit("update-monitor", data);
  } catch (error) {
    logger.error("Failed to emit Andon update", error);
  }
};

/**
 * Emit event real-time update untuk OEE dashboard
 * @param {Object} data OEE calculation data
 */
export const emitOeeUpdate = (data) => {
  try {
    const ioInstance = getIo();
    ioInstance.emit("oee-updated", data);
  } catch (error) {
    logger.error("Failed to emit OEE update", error);
  }
};

/**
 * Emit event real-time update khusus untuk Andon dashboard
 * @param {Object} data Refresh signal data
 */
export const emitAndonDashboardUpdate = (data) => {
  try {
    const ioInstance = getIo();
    ioInstance.emit("andon-dashboard-updated", data);
  } catch (error) {
    logger.error("Failed to emit Andon dashboard update", error);
  }
};

/**
 * Emit event ketika Andon baru di-trigger
 * @param {Object} data - Andon created event data
 * @param {string} data.andonId - ID Andon event
 * @param {number} data.machineId - ID Mesin
 * @param {string} data.machineName - Nama Mesin
 * @param {string} data.type - Kategori masalah (BREAKDOWN, QUALITY, etc)
 * @param {string} data.problemName - Nama masalah
 * @param {Date} data.startTime - Waktu trigger
 * @param {string} data.status - Status Andon (ACTIVE)
 * @param {string} data.plant - Plant location
 * @param {string} data.operator - Nama operator
 * @param {string} data.shift - Nama shift
 */
export const emitAndonCreated = (data) => {
  try {
    const ioInstance = getIo();
    ioInstance.emit("andon-created", data);
    logger.info(`WebSocket: andon-created emitted for Andon ${data.andonId}`);
  } catch (error) {
    logger.error("Failed to emit andon-created event", error);
  }
};

/**
 * Emit event ketika Andon di-resolve
 * @param {Object} data - Andon resolved event data
 * @param {string} data.andonId - ID Andon event
 * @param {number} data.machineId - ID Mesin
 * @param {string} data.machineName - Nama Mesin
 * @param {Date} data.resolvedAt - Waktu resolved
 * @param {number} data.duration - Durasi downtime (menit)
 * @param {number} data.total_duration_menit - Durasi total (decimal menit)
 * @param {number} data.late_menit - Keterlambatan (decimal menit)
 * @param {boolean} data.is_late - Status terlambat
 * @param {string} data.responStatus - Status SLA (ON_TIME/OVER_TIME)
 * @param {number} data.resolverId - ID user yang resolve
 */
export const emitAndonResolved = (data) => {
  try {
    const ioInstance = getIo();
    ioInstance.emit("andon-resolved", data);
    logger.info(`WebSocket: andon-resolved emitted for Andon ${data.andonId}`);
  } catch (error) {
    logger.error("Failed to emit andon-resolved event", error);
  }
};

/**
 * Emit event ketika summary dashboard berubah
 * @param {Object} data - Dashboard summary data
 * @param {number} data.activeAndonCount - Jumlah Andon aktif
 * @param {number} data.resolvedToday - Jumlah Andon resolved hari ini
 * @param {number} data.avgDowntime - Rata-rata downtime (menit)
 * @param {Array} data.problematicMachines - List mesin bermasalah
 */
export const emitAndonSummaryUpdated = (data) => {
  try {
    const ioInstance = getIo();
    ioInstance.emit("andon-summary-updated", data);
    logger.info("WebSocket: andon-summary-updated emitted");
  } catch (error) {
    logger.error("Failed to emit andon-summary-updated event", error);
  }
};

/**
 * Emit event ketika metric berubah (avg downtime, dll)
 * @param {Object} data - Metric change data
 * @param {string} data.metric - Nama metric yang berubah
 * @param {string} data.scope - Scope metric (today, this_week, etc)
 */
export const emitAndonMetricChanged = (data) => {
  try {
    const ioInstance = getIo();
    ioInstance.emit("andon-metric-changed", data);
    logger.info(`WebSocket: andon-metric-changed emitted for ${data.metric}`);
  } catch (error) {
    logger.error("Failed to emit andon-metric-changed event", error);
  }
};
/**
 * Emit event ketika ada panggilan baru (WAITING)
 * @param {Object} data Andon call data
 */
export const emitAndonCallCreated = (data) => {
  try {
    const ioInstance = getIo();
    ioInstance.emit("andon-call-created", data);
    logger.info(`WebSocket: andon-call-created emitted for Call ${data.id}`);
  } catch (error) {
    logger.error("Failed to emit andon-call-created event", error);
  }
};

/**
 * Emit event ketika perbaikan dimulai (IN_REPAIR)
 * @param {Object} data Andon event data
 */
export const emitAndonRepairStarted = (data) => {
  try {
    const ioInstance = getIo();
    ioInstance.emit("andon-repair-started", data);
    logger.info(`WebSocket: andon-repair-started emitted for Event ${data.id}`);
  } catch (error) {
    logger.error("Failed to emit andon-repair-started event", error);
  }
};

/**
 * Emit notifikasi ke user tertentu via room
 * @param {number} userId - ID user penerima
 * @param {Object} notification - Data notifikasi
 */
export const emitNotification = (userId, notification) => {
  try {
    const ioInstance = getIo();
    ioInstance.to(`user:${userId}`).emit("notification", notification);
    logger.info(`Notification emitted to user: ${userId}`);
  } catch (error) {
    logger.error(`Failed to emit notification to user: ${userId}`, error);
  }
};
