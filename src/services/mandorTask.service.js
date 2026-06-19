import prisma from "../../prisma/index.js";
import { emitMandorTaskUpdate } from "../config/socket.js";
import notificationService from "./notification.service.js";

const createTask = async (data) => {
  const mandorId = parseInt(data.mandorId);
  const task = await prisma.mandorTask.create({
    data: {
      supervisorId: data.supervisorId,
      mandorId: mandorId,
      judul: data.judul,
      deskripsi: data.deskripsi,
      prioritas: data.prioritas || "LOW",
      status: "TODO",
      catatan: data.catatan,
      foto: data.foto,
    },
    include: {
      supervisor: { select: { nama: true } },
    },
  });

  // Emit to Mandor
  emitMandorTaskUpdate(mandorId, { type: "TASK_ASSIGNED", task });

  // Send Notification to Mandor
  try {
    await notificationService.createNotification({
      userId: mandorId,
      tipe: "ANNOUNCEMENT",
      judul: "Tugas Baru dari Supervisor",
      pesan: `Anda menerima tugas baru: "${task.judul}". Deskripsi: ${task.deskripsi}`,
    });
  } catch (err) {
    console.error("Gagal membuat notifikasi tugas baru:", err);
  }

  return task;
};

const getTasksForMandor = async (mandorId) => {
  return await prisma.mandorTask.findMany({
    where: { mandorId },
    include: {
      supervisor: {
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

const getTasksForSupervisor = async (supervisorId) => {
  return await prisma.mandorTask.findMany({
    where: { supervisorId },
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

const updateTask = async (id, updateData) => {
  const { mandorId, ...rest } = updateData;
  const data = {
    ...rest,
    ...(mandorId && { mandorId: parseInt(mandorId) }),
  };
  const task = await prisma.mandorTask.update({
    where: { id },
    data: data,
    include: {
      mandor: { select: { id: true, nama: true } },
      supervisor: { select: { id: true, nama: true } },
    },
  });

  // Emit to Supervisor and Mandor
  emitMandorTaskUpdate(task.supervisorId, { type: "TASK_UPDATED", task });
  emitMandorTaskUpdate(task.mandorId, { type: "TASK_UPDATED", task });

  // Send Notification to Supervisor
  try {
    await notificationService.createNotification({
      userId: task.supervisorId,
      tipe: "ANNOUNCEMENT",
      judul: "Update Status Tugas Mandor",
      pesan: `Mandor ${task.mandor?.nama || "Mandor"} telah memperbarui status tugas "${task.judul}" menjadi [${task.status}].`,
    });
  } catch (err) {
    console.error("Gagal membuat notifikasi update tugas:", err);
  }

  return task;
};

const deleteTask = async (id) => {
  const task = await prisma.mandorTask.findUnique({ where: { id } });
  if (task) {
    await prisma.mandorTask.delete({ where: { id } });
    // Emit delete event if needed
    emitMandorTaskUpdate(task.mandorId, { type: "TASK_DELETED", taskId: id });
  }
  return task;
};

export default {
  createTask,
  getTasksForMandor,
  getTasksForSupervisor,
  updateTask,
  deleteTask,
};
