import moment from "moment";
import prisma from "../../prisma/index.js";

const calculateLoadingTime = (shift) => {
  const start = moment(shift.jam_masuk, "HH:mm");
  const end = moment(shift.jam_keluar, "HH:mm");
  let dur = end.diff(start, "minutes");
  if (dur < 0) dur += 1440;

  const allowance =
    shift.break_duration +
    shift.cleaning_duration +
    shift.briefing_duration +
    Math.round(dur * shift.toilet_tolerance_pct);

  return dur - allowance;
};

import { emitOeeUpdate } from "../config/socket.js";
import calculateLoadingTimeFromShift from "../utils/calculateLoadingTimeFromShift.js";

const recalculateByMesin = async (mesinId, date = new Date()) => {
  const shifts = await prisma.shift.findMany();
  const dateStr = moment(date).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  for (const shift of shifts) {
    // 1. Get Downtime Data with Andon Category
    const downtimeData = await prisma.andonDowntimeShift.findMany({
      where: {
        fk_id_mesin: mesinId,
        fk_id_shift: shift.id,
        tanggal: targetDate,
      },
      include: {
        andon: {
          include: { masalah: true },
        },
      },
    });

    let plannedDowntime = 0;
    let unplannedDowntime = 0;

    downtimeData.forEach((d) => {
      if (d.andon?.masalah?.kategori === "PLAN_DOWNTIME") {
        plannedDowntime += d.durasi_menit;
      } else {
        unplannedDowntime += d.durasi_menit;
      }
    });

    const totalDowntime = plannedDowntime + unplannedDowntime;

    // 2. Get Production Data (Sum from LRP)
    // ... (rest of production data logic remains same)
    const lrpData = await prisma.laporanRealisasiProduksi.findMany({
      where: {
        fk_id_mesin: mesinId,
        fk_id_shift: shift.id,
        tanggal: targetDate,
      },
    });

    let totalOk = 0;
    let totalOutput = 0;
    let idealCycleTime = 0;

    lrpData.forEach((l) => {
      totalOk += l.qty_ok;
      totalOutput += l.qty_total_prod;
      if (l.cycle_time > 0) idealCycleTime = l.cycle_time;
    });

    // 3. Constants and Adjusted OEE Logic
    // Planned Downtime (e.g., CHANGE_RPH) reduces the Loading Time window.
    // Unplanned Downtime reduces the Runtime.
    const shiftStandardLoading = calculateLoadingTimeFromShift(shift);
    const loadingTime = Math.max(0, shiftStandardLoading - plannedDowntime);
    const runtime = Math.max(0, loadingTime - unplannedDowntime);

    // 4. Calculate OEE Components
    // Availability = (Loading - Downtime) / Loading
    const availability = loadingTime > 0 ? (runtime / loadingTime) * 100 : 0;

    // Performance = (Ideal Cycle Time * Total Output) / Runtime
    // Usually cycle time is in seconds, runtime is in minutes, but our seed data uses cycle time in MINUTES.
    // So both are in minutes. Correct formula: (ideal_cycle_time_min * total_output) / runtime_min
    const performance =
      runtime > 0 ? ((idealCycleTime * totalOutput) / runtime) * 100 : 0;


    // Quality = Total OK / Total Output
    const quality = totalOutput > 0 ? (totalOk / totalOutput) * 100 : 0;

    // OEE Score
    const oeeScore =
      (availability / 100) * (performance / 100) * (quality / 100) * 100;

    // 5. Upsert OEE Record
    const oeeRecord = await prisma.oEE.upsert({
      where: {
        fk_id_mesin_tanggal_fk_id_shift: {
          fk_id_mesin: mesinId,
          tanggal: targetDate,
          fk_id_shift: shift.id,
        },
      },
      update: {
        availability: Number(availability.toFixed(1)),
        performance: Number(performance.toFixed(1)),
        quality: Number(quality.toFixed(1)),
        oee_score: Number(oeeScore.toFixed(1)),
        loading_time: loadingTime,
        downtime: totalDowntime,
        total_output: totalOutput,
        total_ok: totalOk,
        ideal_cycle_time: idealCycleTime,
      },
      create: {
        fk_id_mesin: mesinId,
        fk_id_shift: shift.id,
        tanggal: targetDate,
        availability: Number(availability.toFixed(1)),
        performance: Number(performance.toFixed(1)),
        quality: Number(quality.toFixed(1)),
        oee_score: Number(oeeScore.toFixed(1)),
        loading_time: loadingTime,
        downtime: totalDowntime,
        total_output: totalOutput,
        total_ok: totalOk,
        ideal_cycle_time: idealCycleTime,
      },
    });

    // 6. Emit Socket Update
    emitOeeUpdate({
      mesinId,
      shiftId: shift.id,
      tanggal: dateStr,
      oee: oeeRecord,
    });
  }
};

const getOEEByMesin = (mesinId) =>
  prisma.oEE.findMany({ where: { fk_id_mesin: Number(mesinId) } });

const getOEEByShift = (shiftId) =>
  prisma.oEE.findMany({ where: { fk_id_shift: Number(shiftId) } });

const getPlantOEE = () =>
  prisma.oEE.aggregate({
    _avg: {
      availability: true,
      performance: true,
      quality: true,
      oee_score: true,
    },
  });

/**
 * Dashboard Specific Services
 */

const determineStatus = (oee) => {
  if (oee >= 85) return "EXCELLENT";
  if (oee >= 75) return "GOOD";
  if (oee >= 65) return "NEEDS_ATTENTION";
  return "CRITICAL";
};

const getOEESummary = async (tanggal, plant) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  let where = { tanggal: targetDate };

  if (plant) {
    const rencanaInPlant = await prisma.rencanaProduksi.findMany({
      where: { user: { plant: plant }, tanggal: targetDate },
      select: { fk_id_mesin: true },
      distinct: ["fk_id_mesin"],
    });
    const machineIds = rencanaInPlant.map((r) => r.fk_id_mesin);
    where.fk_id_mesin = { in: machineIds };
  }

  const oeeData = await prisma.oEE.findMany({
    where,
    select: {
      availability: true,
      performance: true,
      quality: true,
      oee_score: true,
      loading_time: true,
    },
  });

  if (oeeData.length === 0) {
    return {
      availability: 0,
      performance: 0,
      quality: 0,
      oee: 0,
      status: "NO_DATA",
    };
  }

  let totalLoadingTime = 0;
  let weightedAvail = 0;
  let weightedPerf = 0;
  let weightedQual = 0;
  let weightedOee = 0;

  oeeData.forEach((item) => {
    const lt = item.loading_time || 0;
    totalLoadingTime += lt;
    weightedAvail += item.availability * lt;
    weightedPerf += item.performance * lt;
    weightedQual += item.quality * lt;
    weightedOee += item.oee_score * lt;
  });

  if (totalLoadingTime === 0) {
    const count = oeeData.length;
    const result = {
      availability: Number(
        (oeeData.reduce((s, i) => s + i.availability, 0) / count).toFixed(1),
      ),
      performance: Number(
        (oeeData.reduce((s, i) => s + i.performance, 0) / count).toFixed(1),
      ),
      quality: Number(
        (oeeData.reduce((s, i) => s + i.quality, 0) / count).toFixed(1),
      ),
      oee: Number(
        (oeeData.reduce((s, i) => s + i.oee_score, 0) / count).toFixed(1),
      ),
    };
    return { ...result, status: determineStatus(result.oee) };
  }

  const result = {
    availability: Number((weightedAvail / totalLoadingTime).toFixed(1)),
    performance: Number((weightedPerf / totalLoadingTime).toFixed(1)),
    quality: Number((weightedQual / totalLoadingTime).toFixed(1)),
    oee: Number((weightedOee / totalLoadingTime).toFixed(1)),
  };

  return { ...result, status: determineStatus(result.oee) };
};

const getOEETrend = async (tanggal, shiftIds, plant) => {
  const endDateStr = moment(tanggal).format("YYYY-MM-DD");
  const endDate = moment(endDateStr).endOf("day");
  const startDate = moment(endDateStr).subtract(9, "days").startOf("day");

  const dateLabels = [];
  for (let i = 0; i < 10; i++) {
    dateLabels.push(moment(startDate).add(i, "days").format("DD"));
  }

  let where = {
    tanggal: {
      gte: startDate.toDate(),
      lte: endDate.toDate(),
    },
  };

  if (plant) {
    const rencanaInPlant = await prisma.rencanaProduksi.findMany({
      where: {
        user: { plant: plant },
        tanggal: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
      select: { fk_id_mesin: true },
      distinct: ["fk_id_mesin"],
    });
    const machineIds = rencanaInPlant.map((r) => r.fk_id_mesin);
    where.fk_id_mesin = { in: machineIds };
  }

  if (shiftIds && shiftIds.length > 0) {
    const ids = Array.isArray(shiftIds)
      ? shiftIds.map(Number)
      : [Number(shiftIds)];
    where.fk_id_shift = { in: ids };
  }

  const oeeRecords = await prisma.oEE.findMany({
    where,
    select: { fk_id_shift: true, oee_score: true, tanggal: true },
    orderBy: { tanggal: "asc" },
  });

  const trendData = {}; // { shift_id: { dateStr: [scores] } }

  oeeRecords.forEach((item) => {
    const shiftKey = `shift_${item.fk_id_shift}`;
    const dateStr = moment(item.tanggal).format("DD");

    if (!trendData[shiftKey]) trendData[shiftKey] = {};
    if (!trendData[shiftKey][dateStr]) trendData[shiftKey][dateStr] = [];
    trendData[shiftKey][dateStr].push(item.oee_score);
  });

  const response = { labels: dateLabels };

  [1, 2, 3].forEach((id) => {
    const key = `shift_${id}`;
    response[key] = dateLabels.map((dateStr) => {
      const scores = trendData[key] ? trendData[key][dateStr] : null;
      if (!scores || scores.length === 0) return 0;
      return Number(
        (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
      );
    });
  });

  return response;
};

const getDowntimeHistory = async (tanggal, plant) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  const where = { tanggal: targetDate, status: "RESOLVED" };
  if (plant) where.plant = plant;

  const andonEvents = await prisma.andonEvent.findMany({
    where,
    include: { masalah: true },
  });

  const groupData = {};
  andonEvents.forEach((event) => {
    const label = event.masalah.nama_masalah;
    const hours = (event.durasi_downtime || 0) / 60;
    groupData[label] = (groupData[label] || 0) + hours;
  });

  return Object.entries(groupData)
    .map(([label, hours]) => ({
      label,
      hours: Number(hours.toFixed(1)),
    }))
    .sort((a, b) => b.hours - a.hours);
};

const getMachineDetail = async (tanggal, plant) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  let machineWhere = {};
  if (plant) {
    machineWhere.rencana_produksis = {
      some: { user: { plant: plant }, tanggal: targetDate },
    };
  }
  const machines = await prisma.mesin.findMany({ where: machineWhere });
  const machineIds = machines.map((m) => m.id);

  const [oeeRecords, lrpRecords, downtimeShifts, rencanaProduksis] =
    await Promise.all([
      prisma.oEE.findMany({
        where: { tanggal: targetDate, fk_id_mesin: { in: machineIds } },
      }),
      prisma.laporanRealisasiProduksi.findMany({
        where: { tanggal: targetDate, fk_id_mesin: { in: machineIds } },
      }),
      prisma.andonDowntimeShift.findMany({
        where: { tanggal: targetDate, fk_id_mesin: { in: machineIds } },
      }),
      prisma.rencanaProduksi.findMany({
        where: { tanggal: targetDate, fk_id_mesin: { in: machineIds } },
        include: { target: true },
      }),
    ]);

  return machines.map((mesin) => {
    const mcOee = oeeRecords.filter((r) => r.fk_id_mesin === mesin.id);
    const mcLrp = lrpRecords.filter((r) => r.fk_id_mesin === mesin.id);
    const mcDt = downtimeShifts.filter((r) => r.fk_id_mesin === mesin.id);
    const mcRencana = rencanaProduksis.filter(
      (r) => r.fk_id_mesin === mesin.id,
    );

    const shifts = {};
    [1, 2, 3].forEach((shiftId) => {
      const shiftKey = `shift_${shiftId}`;
      const lrp = mcLrp.find((l) => l.fk_id_shift === shiftId);
      const dt = mcDt
        .filter((d) => d.fk_id_shift === shiftId)
        .reduce((sum, d) => sum + d.durasi_menit, 0);
      const rencana = mcRencana.find((r) => r.fk_id_shift === shiftId);

      shifts[shiftKey] = {
        ok: lrp ? lrp.qty_ok : 0,
        ng: lrp ? lrp.qty_ng_proses + lrp.qty_ng_prev : 0,
        downtime: dt,
        target: rencana && rencana.target ? rencana.target.total_target : 0,
      };
    });

    const validOee = mcOee.filter((o) => (o.loading_time || 0) > 0);
    const totalLt = validOee.reduce((sum, r) => sum + (r.loading_time || 0), 0);

    const summary =
      totalLt > 0
        ? {
            availability: Number(
              (
                validOee.reduce(
                  (s, r) => s + r.availability * r.loading_time,
                  0,
                ) / totalLt
              ).toFixed(1),
            ),
            performance: Number(
              (
                validOee.reduce(
                  (s, r) => s + r.performance * r.loading_time,
                  0,
                ) / totalLt
              ).toFixed(1),
            ),
            quality: Number(
              (
                validOee.reduce((s, r) => s + r.quality * r.loading_time, 0) /
                totalLt
              ).toFixed(1),
            ),
            oee: Number(
              (
                validOee.reduce((s, r) => s + r.oee_score * r.loading_time, 0) /
                totalLt
              ).toFixed(1),
            ),
          }
        : {
            availability: 0,
            performance: 0,
            quality: 0,
            oee: 0,
          };

    return { mesin: mesin.nama_mesin, shift: shifts, summary };
  });
};

export default {
  recalculateByMesin,
  getOEEByMesin,
  getOEEByShift,
  getPlantOEE,
  getOEESummary,
  getOEETrend,
  getDowntimeHistory,
  getMachineDetail,
};
