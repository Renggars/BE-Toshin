import prisma from "../../prisma/index.js";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";
import moment from "moment-timezone";

const TZ = "Asia/Jakarta";

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
      `${dateStr} ${shift.jam_masuk}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );
    let shiftEnd = moment.tz(
      `${dateStr} ${shift.jam_keluar}`,
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
  const { fk_id_mesin, fk_id_operator, target_divisi } = payload;
  const currentTime = new Date();

  // Check if there's already a WAITING call or ACTIVE/IN_REPAIR event for this machine
  const activeCall = await prisma.andonCall.findFirst({
    where: { fk_id_mesin, status: "WAITING" },
  });

  if (activeCall) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Sudah ada panggilan (WAITING) di mesin ini",
    );
  }

  const activeEvent = await prisma.andonEvent.findFirst({
    where: {
      fk_id_mesin,
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
    where: { id: fk_id_operator },
    select: { plant: true },
  });

  // Find Divisi Record for target_divisi
  const targetDivisiRecord = await prisma.divisi.findFirst({
    where: {
      nama_divisi: {
        contains: target_divisi.replace("_", " "), // Still helpful if db names have spaces but enum doesn't
      },
    },
  });

  if (!targetDivisiRecord) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      `Divisi tujuan ${target_divisi} tidak ditemukan di master data`,
    );
  }

  return prisma.andonCall.create({
    data: {
      fk_id_mesin,
      fk_id_operator,
      fk_id_shift: shiftId,
      tanggal: operationalDate,
      plant: operator?.plant || null,
      waktu_call: currentTime,
      target_divisi,
      fk_id_target_divisi: targetDivisiRecord.id,
      status: "WAITING",
    },
    include: {
      mesin: true,
      operator: true,
      shift: true,
      divisi_target: true,
    },
  });
};

const getWaitingCalls = async () => {
  return prisma.andonCall.findMany({
    where: { status: "WAITING" },
    include: {
      mesin: true,
      operator: true,
      shift: true,
    },
    orderBy: { waktu_call: "desc" },
  });
};

export default {
  createCall,
  getWaitingCalls,
};
