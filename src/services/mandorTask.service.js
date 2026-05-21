import prisma from "../../prisma/index.js";
import { emitMandorTaskUpdate } from "../config/socket.js";

const createTask = async (data) => {
  const task = await prisma.mandorTask.create({
    data: {
      supervisorId: data.supervisorId,
      mandorId: data.mandorId,
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
  emitMandorTaskUpdate(data.mandorId, { type: "TASK_ASSIGNED", task });

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

const updateTaskStatus = async (id, { status, catatan, foto }) => {
  const task = await prisma.mandorTask.update({
    where: { id },
    data: {
      status,
      catatan: catatan !== undefined ? catatan : undefined,
      foto: foto !== undefined ? foto : undefined,
    },
    include: {
      mandor: { select: { nama: true } },
      supervisor: { select: { id: true } },
    },
  });

  // Emit to Supervisor
  emitMandorTaskUpdate(task.supervisorId, { type: "TASK_STATUS_UPDATED", task });

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
  updateTaskStatus,
  deleteTask,
};
