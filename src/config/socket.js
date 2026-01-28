import { Server } from "socket.io";
import logger from "./logger.js";

let io = null;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    },
  });

  io.on("connection", (socket) => {
    logger.info(`New client connected: ${socket.id}`);

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
