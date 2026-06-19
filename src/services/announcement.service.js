import prisma from "../../prisma/index.js";
import {
  emitOperatorAnnouncement,
  broadcastToRole,
} from "../config/socket.js";
import { v4 as uuidv4 } from "uuid";
import notificationService from "./notification.service.js";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";
import { businessBroadcastTotal } from "../config/businessMetrics.js";


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

  // Track metric
  businessBroadcastTotal.inc({ event: "broadcast" });

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
  // Cari operator (dengan role OPERATOR) yang memiliki RPH berstatus ACTIVE saat ini
  const activeRphs = await prisma.rencanaProduksi.findMany({
    where: {
      status: "ACTIVE",
      operator: { role: "OPERATOR" },
    },
    select: { userId: true },
  });

  const activeOperatorIds = [...new Set(activeRphs.map((r) => r.userId))];

  if (activeOperatorIds.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Tidak ada operator yang sedang aktif saat ini untuk menerima broadcast.",
    );
  }

  const broadcastId = uuidv4();

  // Gunakan Promise.all dengan create agar kita mendapatkan ID dari masing-masing record yang terbuat
  const createdAnnouncements = await Promise.all(
    activeOperatorIds.map(async (operatorId) => {
      return await prisma.operatorAnnouncement.create({
        data: {
          mandorId: data.mandorId,
          operatorId: operatorId,
          pesan: data.pesan,
          broadcastId,
        },
        include: {
          mandor: { select: { nama: true } },
        },
      });
    }),
  );

  // Emit secara spesifik ke room user masing-masing operator yang aktif dengan menyertakan ID
  createdAnnouncements.forEach((ann) => {
    emitOperatorAnnouncement(ann.operatorId, {
      type: "BROADCAST_ANNOUNCEMENT",
      id: ann.id,
      pesan: ann.pesan,
      mandorId: ann.mandorId,
      broadcastId: ann.broadcastId,
      mandor: ann.mandor,
      createdAt: ann.createdAt,
    });
  });

  // Track metric (single increment for the whole broadcast operation)
  businessBroadcastTotal.inc({ event: "broadcast" });

  // Buat notifikasi standar hanya untuk operator yang aktif

  await notificationService.createBulkNotifications(
    activeOperatorIds,
    "ANNOUNCEMENT",
    "Pesan dari Mandor",
    data.pesan
  );

  return { count: createdAnnouncements.length, broadcastId };
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

const getSentByMandor = async (mandorId) => {
  const announcements = await prisma.operatorAnnouncement.findMany({
    where: { mandorId },
    include: {
      operator: {
        select: { id: true, nama: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Grouping di memory
  const broadcastsMap = new Map();
  const privateList = [];

  announcements.forEach((ann) => {
    if (ann.broadcastId) {
      if (!broadcastsMap.has(ann.broadcastId)) {
        broadcastsMap.set(ann.broadcastId, {
          id: ann.broadcastId, // gunakan broadcastId sebagai ID unik riwayat
          type: "BROADCAST",
          pesan: ann.pesan,
          createdAt: ann.createdAt,
          totalRecipients: 0,
          readCount: 0,
          recipients: [],
        });
      }
      const group = broadcastsMap.get(ann.broadcastId);
      group.totalRecipients += 1;
      if (ann.isRead) group.readCount += 1;
      group.recipients.push({
        operatorId: ann.operatorId,
        operatorName: ann.operator?.nama || `Operator #${ann.operatorId}`,
        isRead: ann.isRead,
      });
    } else {
      privateList.push({
        id: ann.id.toString(),
        type: "PRIVATE",
        pesan: ann.pesan,
        createdAt: ann.createdAt,
        operatorId: ann.operatorId,
        operatorName: ann.operator?.nama || `Operator #${ann.operatorId}`,
        isRead: ann.isRead,
      });
    }
  });

  // Gabungkan dan urutkan kembali berdasarkan createdAt desc
  const combined = [...broadcastsMap.values(), ...privateList];
  combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return combined;
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
  getSentByMandor,
};
