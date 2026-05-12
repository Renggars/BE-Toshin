import prisma from "../../prisma/index.js";
import {
  emitOperatorAnnouncement,
  broadcastToRole,
} from "../config/socket.js";
import { v4 as uuidv4 } from "uuid";
import notificationService from "./notification.service.js";

const sendAnnouncement = async (data) => {
  const announcement = await prisma.operatorAnnouncement.create({
    data: {
      mandorId: data.mandorId,
      operatorId: data.operatorId,
      pesan: data.pesan,
    },
    include: {
      mandor: { select: { nama: true } },
    },
  });

  // Emit to Operator
  emitOperatorAnnouncement(data.operatorId, {
    type: "NEW_ANNOUNCEMENT",
    announcement,
  });

  // Also create a standard notification so it appears in the operator's notification history
  await notificationService.createNotification({
    userId: data.operatorId,
    tipe: "ANNOUNCEMENT",
    judul: "Pesan dari Mandor",
    pesan: data.pesan,
  });

  return announcement;
};

const sendBroadcastAnnouncement = async (data) => {
  const operators = await prisma.user.findMany({
    where: { role: "PRODUKSI" },
    select: { id: true },
  });

  const broadcastId = uuidv4();

  const announcementData = operators.map((op) => ({
    mandorId: data.mandorId,
    operatorId: op.id,
    pesan: data.pesan,
    broadcastId,
  }));

  const res = await prisma.operatorAnnouncement.createMany({
    data: announcementData,
  });

  // Emit to role room
  broadcastToRole("PRODUKSI", "new-announcement", {
    type: "BROADCAST_ANNOUNCEMENT",
    pesan: data.pesan,
    mandorId: data.mandorId,
    broadcastId,
  });

  // Also create a standard notification so it appears in all operators' notification histories
  const operatorIds = operators.map((op) => op.id);
  if (operatorIds.length > 0) {
    await notificationService.createBulkNotifications(
      operatorIds,
      "ANNOUNCEMENT",
      "Pesan dari Mandor",
      data.pesan
    );
  }

  return { ...res, broadcastId };
};

const updateBroadcast = async (broadcastId, data) => {
  return await prisma.operatorAnnouncement.updateMany({
    where: { broadcastId },
    data: { pesan: data.pesan },
  });
};

const deleteBroadcast = async (broadcastId) => {
  return await prisma.operatorAnnouncement.deleteMany({
    where: { broadcastId },
  });
};

const getForOperator = async (operatorId) => {
  return await prisma.operatorAnnouncement.findMany({
    where: {
      operatorId: operatorId,
      isRead: false,
    },
    include: {
      mandor: {
        select: {
          id: true,
          nama: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

const markAsRead = async (id) => {
  return await prisma.operatorAnnouncement.update({
    where: { id },
    data: { isRead: true },
  });
};

const updateAnnouncement = async (id, data) => {
  return await prisma.operatorAnnouncement.update({
    where: { id },
    data: { pesan: data.pesan },
  });
};

const deleteAnnouncement = async (id) => {
  return await prisma.operatorAnnouncement.delete({
    where: { id },
  });
};

export default {
  sendAnnouncement,
  sendBroadcastAnnouncement,
  updateBroadcast,
  deleteBroadcast,
  getForOperator,
  markAsRead,
  updateAnnouncement,
  deleteAnnouncement,
};
