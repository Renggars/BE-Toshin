import prisma from "../../prisma/index.js";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";
import moment from "moment-timezone";
import {
  emitAndonCallCreated,
  emitAndonSummaryUpdated,
} from "../config/socket.js";
import andonService from "./andon.service.js";
import notificationService from "./notification.service.js";
import tcpService from "./tcp.service.js";


// TODO JIKA DIVISI BUKAN HANYA MTC BISA DIUBAH DI KODE INI
const getHardwareDivisi = (divisiStr) => {
  // if (!divisiStr) return "MTC";
  // const upper = divisiStr.toUpperCase();
  // if (upper.includes("MAINTENANCE") || upper === "MTC") return "MTC";
  // if (upper.includes("QUALITY") || upper === "QC") return "QC";
  // if (upper.includes("DIE")) return "DIE";
  
  return "MTC"; // Sementara pastikan return selalu MTC
};

const TZ = "Asia/Jakarta";
import { nowWIB } from "../utils/dateWIB.js";

/**
 * Helper: Determine Shift & Operational Date based on time (WIB)
 * (Duplicated from andon.service.js to keep it standalone for now)
 */
const getShiftInfo = async (time) => {
  const shifts = await prisma.shift.findMany();
  const timeMoment = moment(time).tz(TZ);
  const dateStr = timeMoment.format("YYYY-MM-DD");

  for (const shift of shifts) {
    const shiftStart = moment.tz(
      `${dateStr} ${shift.jamMasuk}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );
    let shiftEnd = moment.tz(
      `${dateStr} ${shift.jamKeluar}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );
    let opDate = dateStr;

    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, "day");
      if (timeMoment.isBefore(shiftStart)) {
        shiftStart.subtract(1, "day");
        shiftEnd.subtract(1, "day");
        opDate = moment.tz(dateStr, TZ).subtract(1, "day").format("YYYY-MM-DD");
      }
    }

    if (timeMoment.isBetween(shiftStart, shiftEnd, null, "[]")) {
      return { shiftId: shift.id, operationalDate: opDate };
    }
  }
  return { shiftId: null, operationalDate: dateStr };
};

const createCall = async (payload) => {
  const { mesinId, operatorId, targetDivisi } = payload;
  const currentTime = nowWIB();

  // Check if there's already a WAITING call or ACTIVE/IN_REPAIR event for this machine
  const activeCall = await prisma.andonCall.findFirst({
    where: { mesinId: mesinId, status: "WAITING" },
  });

  if (activeCall) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Sudah ada panggilan (WAITING) di mesin ini",
    );
  }

  const activeEvent = await prisma.andonEvent.findFirst({
    where: {
      mesinId: mesinId,
      status: { in: ["ACTIVE", "IN_REPAIR"] },
    },
  });

  if (activeEvent) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Mesin sedang dalam proses perbaikan/andon active",
    );
  }

  const { shiftId, operationalDate: opDateStr } = await getShiftInfo(
    currentTime,
  );
  const operationalDate = new Date(`${opDateStr}T00:00:00.000Z`);

  // Get Plant from Operator
  const operator = await prisma.user.findUnique({
    where: { id: operatorId },
    select: { plant: true },
  });

  // Find Divisi Record for target_divisi
  const targetDivisiRecord = await prisma.divisi.findFirst({
    where: {
      namaDivisi: {
        contains: targetDivisi.replace("_", " "), // Still helpful if db names have spaces but enum doesn't
      },
    },
  });

  if (!targetDivisiRecord) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      `Divisi tujuan ${targetDivisi} tidak ditemukan di master data`,
    );
  }

  const newCall = await prisma.andonCall.create({
    data: {
      mesinId: mesinId,
      operatorId: operatorId,
      shiftId: shiftId,
      tanggal: operationalDate,
      plant: operator?.plant || null,
      waktuCall: currentTime,
      targetDivisi: targetDivisi,
      targetDivisiId: targetDivisiRecord.id,
      status: "WAITING",
    },
    include: {
      mesin: true,
      operator: true,
      shift: true,
      divisi: true,
    },
  });

  // Emit WebSocket events
  emitAndonCallCreated(newCall);
  const plantFilter = newCall.plant ? { plant: newCall.plant } : {};
  const summary = await andonService.calculateAndonSummary(plantFilter);
  emitAndonSummaryUpdated(summary);

  // Trigger Hardware TCP
  const hwMesin = newCall.mesin?.namaMesin || "UNKNOWN";
  const hwDivisi = getHardwareDivisi(targetDivisi);
  tcpService.broadcastCommand(`ANDON;${hwMesin};${hwDivisi};CALL`);

  // Send notification to supervisors of the TARGET division
  const supervisors = await prisma.user.findMany({
    where: {
      role: "SUPERVISOR",
      divisi: { namaDivisi: { contains: targetDivisi.replace("_", " ") } },
    },
    select: { id: true },
  });

  if (supervisors.length > 0) {
    const waktuWIB = moment(currentTime).tz(TZ).format("DD-MM-YYYY HH:mm:ss");
    const namaMesin = newCall.mesin?.namaMesin || "-";
    const namaOperator = newCall.operator?.nama || "-";
    const namaShift = newCall.shift?.namaShift || "-";
    const plantInfo = newCall.plant || "-";

    const pesan =
      `🚨 Andon Call Baru!\n` +
      `Mesin: ${namaMesin}\n` +
      `Operator: ${namaOperator}\n` +
      `Waktu: ${waktuWIB} WIB\n` +
      `Shift: ${namaShift}\n` +
      `Plant: ${plantInfo}\n` +
      `Divisi Tujuan: ${targetDivisi}`;

    await notificationService.createBulkNotifications(
      supervisors.map((s) => s.id),
      "ANDON_CALL",
      `Andon Call - ${namaMesin}`,
      pesan,
    );
  }

  return newCall;
};

const getWaitingCalls = async () => {
  return prisma.andonCall.findMany({
    where: { status: "WAITING" },
    include: {
      mesin: true,
      operator: true,
      shift: true,
    },
    orderBy: { waktuCall: "desc" },
  });
};

export default {
  createCall,
  getWaitingCalls,
};
