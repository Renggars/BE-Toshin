import moment from "moment";
import prisma from "../../prisma/index.js";
import { emitOeeUpdate } from "../config/socket.js";

/**
 * Calculate OEE for specific machine and date
 * @param {number} mesinId
 * @param {Date} tanggal
 * @param {number} shiftId (Optional, if null calculate for all shifts)
 */
const calculateOEE = async (mesinId, tanggal, shiftId = null) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const startOfDay = moment(tanggal).startOf("day").toDate();
  const endOfDay = moment(tanggal).endOf("day").toDate();

  // 1. Get Machine Data (Ideal Cycle Time)
  const mesin = await prisma.mesin.findUnique({ where: { id: mesinId } });
  if (!mesin) throw new Error("Mesin not found");

  // 2. Get Shifts (Filter by specific shift if provided)
  const shifts = await prisma.shift.findMany({
    where: shiftId ? { id: shiftId } : {},
  });

  // 3. Get Production Logs
  const logs = await prisma.produksiLog.findMany({
    where: {
      fk_id_mesin: mesinId,
      fk_id_shift: shiftId ? shiftId : undefined,
      tanggal: { gte: startOfDay, lte: endOfDay },
    },
  });

  // 4. Get Downtime from Andon Events (Resolved only)
  // Downtime must be within the specific shift time range ideally,
  // but for simplicity we take total downtime and assume it belongs to the active shift
  // or distribute it. Here filtering by day is safer.
  const andonEvents = await prisma.andonEvent.findMany({
    where: {
      fk_id_mesin: mesinId,
      status: "RESOLVED",
      waktu_trigger: { gte: startOfDay, lte: endOfDay },
      // Kw: Removed is_downtime check as per user request
    },
  });

  let totalLoadingTime = 0;
  let totalDowntime = 0;
  let totalOutput = 0;
  let totalOK = 0;

  // Calculate Downtime
  totalDowntime = andonEvents.reduce(
    (acc, curr) => acc + (curr.durasi_downtime || 0),
    0,
  );

  // Calculate Output & OK from Logs
  totalOutput = logs.reduce(
    (acc, curr) => acc + (curr.total_ok + curr.total_ng),
    0,
  );
  totalOK = logs.reduce((acc, curr) => acc + curr.total_ok, 0);

  // Calculate Loading Time per Shift
  for (const shift of shifts) {
    const jamMasuk = moment(shift.jam_masuk, "HH:mm");
    const jamKeluar = moment(shift.jam_keluar, "HH:mm");

    // Handle cross-day shift (if needed, simplified assumption same day for now)
    let shiftDurationMinutes = jamKeluar.diff(jamMasuk, "minutes");
    if (shiftDurationMinutes < 0) shiftDurationMinutes += 24 * 60; // Handle overnight
    // Koreksi 1440 jika 0 (full 24h?) - usually simple diff works if dates aligned or just minutes

    // Deductions: Briefing (10) + Cleaning (10) + Tolerance (10% of shift)
    const allowanceTime = 20; // 10 + 10
    const toleranceTime = Math.round(shiftDurationMinutes * 0.1);

    const cycleTime = shiftDurationMinutes - (allowanceTime + toleranceTime);
    totalLoadingTime += cycleTime;
  }

  // --- OEE FORMULA ---

  // 1. Availability = (Loading Time - Downtime) / Loading Time
  const operatingTime = totalLoadingTime - totalDowntime;
  const availability =
    totalLoadingTime > 0 ? (operatingTime / totalLoadingTime) * 100 : 0;

  // 2. Performance = (Total Output * Ideal Cycle Time) / Operating Time
  // Ideal Cycle Time is in seconds, Operating Time in minutes
  const idealCycleTimeSec = mesin.ideal_cycle_time || 0;
  const idealOperatingTimeSec = totalOutput * idealCycleTimeSec;
  const operatingTimeSec = operatingTime * 60;

  const performance =
    operatingTimeSec > 0 ? (idealOperatingTimeSec / operatingTimeSec) * 100 : 0;

  // 3. Quality = Total OK / Total Output
  const quality = totalOutput > 0 ? (totalOK / totalOutput) * 100 : 0;

  // 4. OEE Score = A * P * Q
  const oeeScore = (availability * performance * quality) / 10000;

  // 5. Save/Update OEE Record
  const oeeRecord = await prisma.oEE.upsert({
    where: {
      fk_id_mesin_tanggal_fk_id_shift: {
        // Unique constraint name matches defined in schema?
        fk_id_mesin: mesinId,
        tanggal: startOfDay, // Prisma DateTime filter matches date object
        fk_id_shift: shiftId || 0, // 0 for daily total if schema allows
      },
    },
    // Workaround for strict upsert with nullable unique fields:
    // Actually let's use check existing then update or create to avoid prisma weirdness with null unique keys
    update: {
      availability,
      performance,
      quality,
      oee_score: oeeScore,
      loading_time: totalLoadingTime,
      downtime: totalDowntime,
      total_output: totalOutput,
      total_ok: totalOK,
    },
    create: {
      fk_id_mesin: mesinId,
      tanggal: startOfDay,
      fk_id_shift: shiftId,
      availability,
      performance,
      quality,
      oee_score: oeeScore,
      loading_time: totalLoadingTime,
      downtime: totalDowntime,
      total_output: totalOutput,
      total_ok: totalOK,
    },
  });

  // 6. Emit Socket Event
  emitOeeUpdate({
    mesinId,
    tanggal: dateStr,
    oee: {
      availability: availability.toFixed(2),
      performance: performance.toFixed(2),
      quality: quality.toFixed(2),
      score: oeeScore.toFixed(2),
    },
  });

  return oeeRecord;
};

/* Wrapper to handle findFirst + Update/Create manually if UPSERT is problematic with NULL shift */
const saveOEE = async (data) => {
  const { fk_id_mesin, tanggal, fk_id_shift } = data;

  // Find existing
  const existing = await prisma.oEE.findFirst({
    where: {
      fk_id_mesin,
      tanggal,
      fk_id_shift,
    },
  });

  if (existing) {
    return prisma.oEE.update({
      where: { id: existing.id },
      data,
    });
  } else {
    return prisma.oEE.create({ data });
  }
};

/**
 * Trigger recalculation (called from Andon resolve or production log)
 */
const recalculateOEE = async (mesinId, tanggal = new Date()) => {
  try {
    // Re-calculate using the logic above but adapting save mechanism
    // Since calculateOEE function above attempts upsert, let's fix it for safety
    // We will calculate metrics then use saveOEE

    // RE-IMPLEMENTING calculateOEE logic for robustness:
    const startOfDay = moment(tanggal).startOf("day").toDate();
    const endOfDay = moment(tanggal).endOf("day").toDate();

    const mesin = await prisma.mesin.findUnique({ where: { id: mesinId } });
    if (!mesin) return; // Should not happen

    // Calculate for ALL SHIFTS combined (Daily OEE)
    // We use the Refactored helper below
    return await calculateOEERefactored(mesinId, tanggal);
  } catch (err) {
    console.error("OEE Recalculation Error:", err);
  }
};

// Refactored Helper
const calculateOEERefactored = async (mesinId, tanggal) => {
  const startOfDay = moment(tanggal).startOf("day").toDate();
  const endOfDay = moment(tanggal).endOf("day").toDate();

  const mesin = await prisma.mesin.findUnique({ where: { id: mesinId } });
  const logs = await prisma.produksiLog.findMany({
    where: {
      fk_id_mesin: mesinId,
      tanggal: { gte: startOfDay, lte: endOfDay },
    },
  });
  const andonEvents = await prisma.andonEvent.findMany({
    where: {
      fk_id_mesin: mesinId,
      status: "RESOLVED",
      waktu_trigger: { gte: startOfDay, lte: endOfDay },
      // Note: Removed is_downtime check
    },
  });
  const shifts = await prisma.shift.findMany();

  // Calculate Metrics
  const totalDowntime = andonEvents.reduce(
    (acc, curr) => acc + (curr.durasi_downtime || 0),
    0,
  );
  const totalOutput = logs.reduce(
    (acc, curr) => acc + (curr.total_ok + curr.total_ng),
    0,
  );
  const totalOK = logs.reduce((acc, curr) => acc + curr.total_ok, 0);

  let totalLoadingTime = 0;
  for (const shift of shifts) {
    const jamMasuk = moment(shift.jam_masuk, "HH:mm");
    const jamKeluar = moment(shift.jam_keluar, "HH:mm");
    let duration = jamKeluar.diff(jamMasuk, "minutes");
    if (duration < 0) duration += 1440;

    // Formula User: Shift - 20min - 10%
    const deduction = 20 + Math.round(duration * 0.1);
    totalLoadingTime += duration - deduction;
  }

  const operatingTime = totalLoadingTime - totalDowntime;
  const availability =
    totalLoadingTime > 0 ? (operatingTime / totalLoadingTime) * 100 : 0;

  const idealCycleTimeSec = mesin.ideal_cycle_time || 0;
  const performance =
    operatingTime * 60 > 0
      ? ((totalOutput * idealCycleTimeSec) / (operatingTime * 60)) * 100
      : 0;

  const quality = totalOutput > 0 ? (totalOK / totalOutput) * 100 : 0;
  const oeeScore = (availability * performance * quality) / 10000;

  // SAVE
  const data = {
    fk_id_mesin: mesinId,
    tanggal: startOfDay,
    fk_id_shift: null, // Daily Aggregate
    availability,
    performance,
    quality,
    oee_score: oeeScore,
    loading_time: totalLoadingTime,
    downtime: totalDowntime,
    total_output: totalOutput,
    total_ok: totalOK,
  };

  await saveOEE(data);

  // EMIT
  emitOeeUpdate({
    mesinId,
    tanggal: moment(tanggal).format("YYYY-MM-DD"),
    oee: {
      availability: availability.toFixed(1),
      performance: performance.toFixed(1),
      quality: quality.toFixed(1),
      score: oeeScore.toFixed(1),
    },
  });

  return data;
};

const getOEEByMesin = async (mesinId, tanggal = new Date()) => {
  const startOfDay = moment(tanggal).startOf("day").toDate();
  return prisma.oEE.findFirst({
    where: {
      fk_id_mesin: parseInt(mesinId),
      tanggal: startOfDay,
      fk_id_shift: null,
    },
    include: { mesin: true },
  });
};

const getDashboardSummary = async () => {
  // Logic untuk dashboard summary (rata-rata OEE semua mesin hari ini)
  const startOfDay = moment().startOf("day").toDate();
  const oeeList = await prisma.oEE.findMany({
    where: { tanggal: startOfDay, fk_id_shift: null },
    include: { mesin: true },
  });
  return oeeList;
};

export default {
  calculateOEE: calculateOEERefactored,
  recalculateOEE,
  getOEEByMesin,
  getDashboardSummary,
};
