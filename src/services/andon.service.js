import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import { emitAndonUpdate } from "../config/socket.js";
import oeeService from "./oee.service.js";
import moment from "moment";

/**
 * Trigger Andon Event
 * @param {Object} payload
 * @returns {Promise<AndonEvent>}
 */
const triggerAndon = async (payload) => {
  const { fk_id_mesin, fk_id_masalah, fk_id_operator } = payload;

  // 1. Validasi Mesin & Masalah
  const [mesin, masalah] = await Promise.all([
    prisma.mesin.findUnique({ where: { id: fk_id_mesin } }),
    prisma.masterMasalahAndon.findUnique({ where: { id: fk_id_masalah } }),
  ]);

  if (!mesin || !masalah) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Mesin atau Kode Masalah tidak valid",
    );
  }

  // 2. Cek apakah ada event aktif untuk mesin ini dengan masalah yang sama?
  // (Optional: Bisa dibatasi satu mesin cuma boleh satu active andon)
  const activeEvent = await prisma.andonEvent.findFirst({
    where: {
      fk_id_mesin,
      status: "ACTIVE",
    },
  });

  if (activeEvent) {
    // Jika sudah ada andon aktif, kita bisa reject atau simply return existing
    // Untuk IoT button, kadang terpencet double, jadi lebih aman return existing kalau masalahnya sama
    if (activeEvent.fk_id_masalah === fk_id_masalah) {
      return activeEvent;
    }
    // Jika masalah beda, mungkin mesin mengalami multiple issues
  }

  // 3. Create Event
  const newEvent = await prisma.andonEvent.create({
    data: {
      fk_id_mesin,
      fk_id_masalah,
      fk_id_operator: fk_id_operator || null,
      status: "ACTIVE",
      waktu_trigger: new Date(),
    },
    include: {
      mesin: true,
      masalah: true,
      operator: { select: { nama: true } },
    },
  });

  // 4. Emit Socket Event
  emitAndonUpdate({
    type: "TRIGGER",
    data: newEvent,
    message: `Andon triggered on ${mesin.nama_mesin}: ${masalah.nama_masalah}`,
  });

  return newEvent;
};

/**
 * Resolve Andon Event
 * @param {number} eventId
 * @param {Object} resolutionData { resolved_by, catatan }
 * @returns {Promise<AndonEvent>}
 */
const resolveAndon = async (eventId, resolutionData) => {
  const event = await prisma.andonEvent.findUnique({
    where: { id: eventId },
    include: { masalah: true },
  });

  if (!event) {
    throw new ApiError(httpStatus.NOT_FOUND, "Andon event not found");
  }

  if (event.status === "RESOLVED") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Andon event already resolved");
  }

  const waktuResolved = new Date();
  const waktuTrigger = new Date(event.waktu_trigger);

  // Hitung durasi dalam menit
  const diffMs = waktuResolved - waktuTrigger;
  const durasiMenit = Math.ceil(diffMs / (1000 * 60));

  const updatedEvent = await prisma.andonEvent.update({
    where: { id: eventId },
    data: {
      status: "RESOLVED",
      waktu_resolved: waktuResolved,
      durasi_downtime: durasiMenit,
      resolved_by: resolutionData.resolved_by,
      catatan: resolutionData.catatan,
    },
    include: {
      mesin: true,
      masalah: true,
      resolver: { select: { nama: true } },
    },
  });

  // Emit Socket Event
  emitAndonUpdate({
    type: "RESOLVE",
    data: updatedEvent,
    message: `Andon resolved on ${updatedEvent.mesin.nama_mesin}. Duration: ${durasiMenit} min`,
  });

  // Trigger OEE Recalculation (All resolved andon events affect OEE now)
  oeeService.recalculateOEE(updatedEvent.fk_id_mesin, waktuResolved);

  return updatedEvent;
};

/**
 * Get Active Andon Events
 * @returns {Promise<Array>}
 */
const getActiveEvents = async () => {
  return prisma.andonEvent.findMany({
    where: { status: "ACTIVE" },
    include: {
      mesin: true,
      masalah: true,
      operator: { select: { nama: true } },
    },
    orderBy: { waktu_trigger: "desc" },
  });
};

/**
 * Get Andon History
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
const getAndonHistory = async (filters) => {
  const { startDate, endDate, mesinId } = filters;

  const where = {};

  if (mesinId) {
    where.fk_id_mesin = parseInt(mesinId);
  }

  if (startDate && endDate) {
    where.waktu_trigger = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  return prisma.andonEvent.findMany({
    where,
    include: {
      mesin: true,
      masalah: true,
      operator: { select: { nama: true } },
      resolver: { select: { nama: true } },
    },
    orderBy: { waktu_trigger: "desc" },
    take: 100, // Limit result
  });
};

export default {
  triggerAndon,
  resolveAndon,
  getActiveEvents,
  getAndonHistory,
};
