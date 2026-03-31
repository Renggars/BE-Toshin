import moment from "moment";
import prisma from "../../prisma/index.js";

const calculateLoadingTime = (shift) => {
  const start = moment(shift.jamMasuk, "HH:mm");
  const end = moment(shift.jamKeluar, "HH:mm");
  let dur = end.diff(start, "minutes");
  if (dur < 0) dur += 1440;

  const allowance =
    shift.breakDuration +
    shift.cleaningDuration +
    shift.briefingDuration +
    Math.round(dur * shift.toiletTolerancePct);

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
        mesinId,
        shiftId: shift.id,
        tanggal: targetDate,
      },
      include: {
        andonEvent: {
          include: { masterMasalahAndon: true },
        },
      },
    });

    let plannedDowntime = 0;
    let unplannedDowntime = 0;

    downtimeData.forEach((d) => {
      if (d.andonEvent?.masterMasalahAndon?.kategori === "PLAN_DOWNTIME") {
        plannedDowntime += d.durasiMenit;
      } else {
        unplannedDowntime += d.durasiMenit;
      }
    });

    const totalDowntime = plannedDowntime + unplannedDowntime;

    // 2. Get Production Data (Sum from LRP)
    // ... (rest of production data logic remains same)
    const lrpData = await prisma.laporanRealisasiProduksi.findMany({
      where: {
        mesinId: mesinId,
        shiftId: shift.id,
        tanggal: targetDate,
      },
    });

    let totalOk = 0;
    let totalOutput = 0;
    let idealCycleTime = 0;

    lrpData.forEach((l) => {
      totalOk += l.qtyOk;
      totalOutput += l.qtyTotalProd;
      if (l.cycleTime > 0) idealCycleTime = l.cycleTime;
    });

    // 3. Constants and Adjusted OEE Logic
    // Planned Downtime (e.g., CHANGE_RPH) reduces the Loading Time window.
    // Unplanned Downtime reduces the Runtime.
    const shiftStandardLoading = calculateLoadingTimeFromShift(shift);

    // [New Code] Activity Check: Skip OEE generation if there is absolutely no actual activity
    // We ONLY care if there is an LRP (actual production).
    // OEE is only valid and should only be generated when LRP is posted.
    if (lrpData.length === 0) {
      // Clean up orphaned/empty OEE records if they exist
      await prisma.oee.deleteMany({
        where: {
          mesinId: mesinId,
          shiftId: shift.id,
          tanggal: targetDate,
        },
      });
      continue;
    }

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
    const oeeRecord = await prisma.oee.upsert({
      where: {
        mesinId_tanggal_shiftId: {
          mesinId: mesinId,
          tanggal: targetDate,
          shiftId: shift.id,
        },
      },
      update: {
        availability: Number(availability.toFixed(1)),
        performance: Number(performance.toFixed(1)),
        quality: Number(quality.toFixed(1)),
        oeeScore: Number(oeeScore.toFixed(1)),
        loadingTime: loadingTime,
        downtime: totalDowntime,
        totalOutput: totalOutput,
        totalOk: totalOk,
        idealCycleTime: idealCycleTime,
      },
      create: {
        mesinId: mesinId,
        shiftId: shift.id,
        tanggal: targetDate,
        availability: Number(availability.toFixed(1)),
        performance: Number(performance.toFixed(1)),
        quality: Number(quality.toFixed(1)),
        oeeScore: Number(oeeScore.toFixed(1)),
        loadingTime: loadingTime,
        downtime: totalDowntime,
        totalOutput: totalOutput,
        totalOk: totalOk,
        idealCycleTime: idealCycleTime,
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
  prisma.oee.findMany({ where: { mesinId: Number(mesinId) } });

const getOEEByShift = (shiftId) =>
  prisma.oee.findMany({ where: { shiftId: Number(shiftId) } });

const getPlantOEE = () =>
  prisma.oee.aggregate({
    _avg: {
      availability: true,
      performance: true,
      quality: true,
      oeeScore: true,
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
      where: { operator: { plant: plant }, tanggal: targetDate },
      select: { mesinId: true },
      distinct: ["mesinId"],
    });
    const machineIds = rencanaInPlant.map((r) => r.mesinId);
    where.mesinId = { in: machineIds };
  }

  const oeeData = await prisma.oee.findMany({
    where,
    select: {
      availability: true,
      performance: true,
      quality: true,
      oeeScore: true,
      loadingTime: true,
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
    const lt = item.loadingTime || 0;
    totalLoadingTime += lt;
    weightedAvail += item.availability * lt;
    weightedPerf += item.performance * lt;
    weightedQual += item.quality * lt;
    weightedOee += item.oeeScore * lt;
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
        (oeeData.reduce((s, i) => s + i.oeeScore, 0) / count).toFixed(1),
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
        operator: { plant: plant },
        tanggal: {
          gte: startDate.toDate(),
          lte: endDate.toDate(),
        },
      },
      select: { mesinId: true },
      distinct: ["mesinId"],
    });
    const machineIds = rencanaInPlant.map((r) => r.mesinId);
    where.mesinId = { in: machineIds };
  }

  if (shiftIds && shiftIds.length > 0) {
    const ids = Array.isArray(shiftIds)
      ? shiftIds.map(Number)
      : [Number(shiftIds)];
    where.shiftId = { in: ids };
  }

  const oeeRecords = await prisma.oee.findMany({
    where,
    select: { shiftId: true, oeeScore: true, tanggal: true },
    orderBy: { tanggal: "asc" },
  });

  const trendData = {}; // { shift_id: { dateStr: [scores] } }

  oeeRecords.forEach((item) => {
    const shiftKey = `shift${item.shiftId}`;
    const dateStr = moment(item.tanggal).format("DD");

    if (!trendData[shiftKey]) trendData[shiftKey] = {};
    if (!trendData[shiftKey][dateStr]) trendData[shiftKey][dateStr] = [];
    trendData[shiftKey][dateStr].push(item.oeeScore);
  });

  const response = { labels: dateLabels };

  [1, 2, 3].forEach((id) => {
    const key = `shift${id}`;
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
    include: { masterMasalahAndon: true },
  });

  const groupData = {};
  andonEvents.forEach((event) => {
    const label = event.masterMasalahAndon.namaMasalah;
    const hours = (event.durasiDowntime || 0) / 60;
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

  let machineWhere = {
    OR: [
      { laporanRealisasiProduksi: { some: { tanggal: targetDate } } },
      { andonDowntimeShift: { some: { tanggal: targetDate } } },
    ],
  };

  if (plant) {
    machineWhere.AND = [
      {
        rencanaProduksi: {
          some: { operator: { plant: plant }, tanggal: targetDate },
        },
      },
    ];
  }
  const machines = await prisma.mesin.findMany({ where: machineWhere });
  const machineIds = machines.map((m) => m.id);

  const [oeeRecords, lrpRecords, downtimeShifts, rencanaProduksis] =
    await Promise.all([
      prisma.oee.findMany({
        where: { tanggal: targetDate, mesinId: { in: machineIds } },
      }),
      prisma.laporanRealisasiProduksi.findMany({
        where: { tanggal: targetDate, mesinId: { in: machineIds } },
      }),
      prisma.andonDowntimeShift.findMany({
        where: { tanggal: targetDate, mesinId: { in: machineIds } },
      }),
      prisma.rencanaProduksi.findMany({
        where: { tanggal: targetDate, mesinId: { in: machineIds } },
        include: { target: true },
      }),
    ]);

  return machines.map((mesin) => {
    const mcOee = oeeRecords.filter((r) => r.mesinId === mesin.id);
    const mcLrp = lrpRecords.filter((r) => r.mesinId === mesin.id);
    const mcDt = downtimeShifts.filter((r) => r.mesinId === mesin.id);
    const mcRencana = rencanaProduksis.filter(
      (r) => r.mesinId === mesin.id,
    );

    const shifts = {};
    [1, 2, 3].forEach((shiftId) => {
      const shiftKey = `shift${shiftId}`;
      const lrp = mcLrp.find((l) => l.shiftId === shiftId);
      const dt = mcDt
        .filter((d) => d.shiftId === shiftId)
        .reduce((sum, d) => sum + d.durasiMenit, 0);
      const rencana = mcRencana.find((r) => r.shiftId === shiftId);

      shifts[shiftKey] = {
        ok: lrp ? lrp.qtyOk : 0,
        ng: lrp ? lrp.qtyNgProses + lrp.qtyNgPrev : 0,
        downtime: dt,
        target: rencana && rencana.target ? rencana.target.totalTarget : 0,
      };
    });

    const validOee = mcOee.filter((o) => (o.loadingTime || 0) > 0);
    const totalLt = validOee.reduce((sum, r) => sum + (r.loadingTime || 0), 0);

    const summary =
      totalLt > 0
        ? {
            availability: Number(
              (
                validOee.reduce(
                  (s, r) => s + r.availability * r.loadingTime,
                  0,
                ) / totalLt
              ).toFixed(1),
            ),
            performance: Number(
              (
                validOee.reduce(
                  (s, r) => s + r.performance * r.loadingTime,
                  0,
                ) / totalLt
              ).toFixed(1),
            ),
            quality: Number(
              (
                validOee.reduce((s, r) => s + r.quality * r.loadingTime, 0) /
                totalLt
              ).toFixed(1),
            ),
            oee: Number(
              (
                validOee.reduce((s, r) => s + r.oeeScore * r.loadingTime, 0) /
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

    return { machineName: mesin.namaMesin, shifts: shifts, summary };
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
