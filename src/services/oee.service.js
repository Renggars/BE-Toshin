import moment from "moment";
import prisma from "../../prisma/index.js";
import { nowWIB } from "../utils/dateWIB.js";

import { emitOeeUpdate } from "../config/socket.js";

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

    // 2. Get Production Data (Sum from LRP)
    // ... (rest of production data logic remains same)
    const lrpData = await prisma.laporanRealisasiProduksi.findMany({
      where: {
        mesinId: mesinId,
        shiftId: shift.id,
        tanggal: targetDate,
      },
      include: { rencanaProduksi: true },
    });

    let totalOk = 0;
    let totalOutput = 0;
    let idealCycleTime = 0;

    lrpData.forEach((l) => {
      totalOk += l.qtyOk;
      totalOutput += l.qtyTotalProd;
      if (l.cycleTime > 0) idealCycleTime = l.cycleTime;
    });

    // 3. Dynamic Loading Time based on Attendance & LRP
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        rencanaProduksi: {
          mesinId: mesinId,
          shiftId: shift.id,
          tanggal: targetDate,
        },
      },
      orderBy: { jamTap: "asc" },
    });

    const lrpUpdates = lrpData.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));

    // 3. Filter by RencanaProduksi (RPH) - Only process if discovery shows it's relevant
    // If no LRP and no Downtime, we skip this machine/shift
    if (lrpData.length === 0 && downtimeData.length === 0) {
      continue;
    }

    const now = nowWIB(); // Use consistent WIB time
    
   // Start of operating time: Absolut menggunakan jam tap absensi
    const firstActivity = attendanceRecords.length > 0 
      ? moment(attendanceRecords[0].jamTap)
      : null;

    if (!firstActivity) continue; 

    // CASE: Check if ANY RPH for this machine/shift/date is still ACTIVE
    // If ACTIVE, window goes until 'now'. If all are CLOSED, window goes until the last LRP update.
    const isAnyActive = lrpData.some(l => l.rencanaProduksi?.status === "ACTIVE" || l.rencanaProduksi?.status === "PLANNED");

    // End of operating window: Last LRP update or Now
    const lastActivity = (isAnyActive || lrpUpdates.length === 0)
      ? now 
      : moment(lrpUpdates[lrpUpdates.length - 1].updatedAt);

    // Measurement window duration (use float diff for precision)
    const dynamicLoadingMinutes = Math.max(0, lastActivity.diff(firstActivity, "minutes", true));

    // Calculation according to user request:
    // 1. Total Time = jam tap - jam submit ltp (window of activity)
    const totalTime = dynamicLoadingMinutes;

    // 2. Planned Production Time = Total Time - Planned Downtime
    const loadingTime = Number(Math.max(0, totalTime - plannedDowntime).toFixed(1));

    // 3. Operating Time (Run Time) = Planned Production Time - Unplanned Downtime
    const downtime = Number(unplannedDowntime.toFixed(1));
    const runtime = Math.max(0, loadingTime - downtime);

    // 4. Calculate OEE Components
    const availability = loadingTime > 0 ? (runtime / loadingTime) * 100 : 0;

    const expectedTimeMinutes = (idealCycleTime || 0) * totalOutput;
    const performanceRaw = runtime > 0 ? (expectedTimeMinutes / runtime) * 100 : 0;
    const performance = Math.min(100, performanceRaw);

    const quality = totalOutput > 0 ? (totalOk / totalOutput) * 100 : 0;

    // OEE Score
    const oeeScore =
      (availability / 100) * (performance / 100) * (quality / 100) * 100;

    // DEBUG LOGS
    // console.log(`[OEE DEBUG] Mesin: ${mesinId}, Shift: ${shift.id}, Tanggal: ${dateStr}`);
    // console.log(`  > Activity: ${firstActivity.format("HH:mm:ss")} - ${lastActivity.format("HH:mm:ss")} ${isAnyActive ? '(ACTIVE)' : '(CLOSED)'}`);
    // console.log(`  > Total Time: ${totalTime.toFixed(2)}m | PlannedDt: ${plannedDowntime.toFixed(2)}m`);
    // console.log(`  > Loading Time (Planned Prod Time): ${loadingTime.toFixed(2)}m`);
    // console.log(`  > Unplanned Downtime: ${downtime.toFixed(2)}m | Runtime (Operating Time): ${runtime.toFixed(2)}m`);
    // console.log(`  > Ideal CT: ${idealCycleTime}m | Output: ${totalOutput} | Expected Time: ${expectedTimeMinutes.toFixed(2)}m`);
    // console.log(`  > Performance: ${performanceRaw.toFixed(2)}% (Capped to ${performance.toFixed(2)}%)`);
    // console.log(`  > Availability: ${availability.toFixed(2)}% | Quality: ${quality.toFixed(2)}% | OEEScore: ${oeeScore.toFixed(2)}%`);


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
        loadingTime,
        downtime,
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
        loadingTime,
        downtime,
        totalOutput: totalOutput,
        totalOk: totalOk,
        idealCycleTime: idealCycleTime,
        createdAt: nowWIB(),
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
    const plantRphs = await prisma.rencanaProduksi.findMany({
      where: { operator: { plant: plant }, tanggal: targetDate },
      select: { mesinId: true, shiftId: true },
    });
    if (plantRphs.length === 0) return { availability: 0, performance: 0, quality: 0, oee: 0, status: "NO_DATA" };
    
    where.OR = plantRphs.map((r) => ({
      mesinId: r.mesinId,
      shiftId: r.shiftId,
    }));
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
    const plantRphs = await prisma.rencanaProduksi.findMany({
      where: { 
        operator: { plant: plant }, 
        tanggal: { gte: startDate.toDate(), lte: endDate.toDate() } 
      },
      select: { mesinId: true, shiftId: true, tanggal: true },
    });

    if (plantRphs.length === 0) return { labels: dateLabels, overall: dateLabels.map(() => 0) };

    where.OR = plantRphs.map((r) => ({
      mesinId: r.mesinId,
      shiftId: r.shiftId,
      tanggal: r.tanggal,
    }));
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

  const trendData = {}; // { dateStr: [scores] }

  oeeRecords.forEach((item) => {
    const dateStr = moment(item.tanggal).format("DD");
    if (!trendData[dateStr]) trendData[dateStr] = [];
    trendData[dateStr].push(item.oeeScore);
  });

  const response = { labels: dateLabels };

  response.overall = dateLabels.map((dateStr) => {
    const scores = trendData[dateStr] || [];
    if (scores.length === 0) return 0;
    return Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
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
    const minutes = event.durasiDowntime || 0;
    groupData[label] = (groupData[label] || 0) + minutes;
  });

  return Object.entries(groupData)
    .map(([label, minutes]) => ({
      label,
      minutes: Number(minutes.toFixed(1)),
    }))
    .sort((a, b) => b.minutes - a.minutes);
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

  let plantRphIds = [];
  let plantPairs = [];

  if (plant) {
    const plantRphs = await prisma.rencanaProduksi.findMany({
      where: { operator: { plant: plant }, tanggal: targetDate },
      select: { id: true, mesinId: true, shiftId: true },
    });
    plantRphIds = plantRphs.map(r => r.id);
    plantPairs = plantRphs.map(r => ({ mesinId: r.mesinId, shiftId: r.shiftId }));
    
    machineWhere.AND = [
      { id: { in: [...new Set(plantRphs.map(r => r.mesinId))] } }
    ];
  }

  const machines = await prisma.mesin.findMany({ where: machineWhere });
  const machineIds = machines.map((m) => m.id);

  const [oeeRecords, lrpRecords, downtimeShifts, rencanaProduksis] =
    await Promise.all([
      prisma.oee.findMany({
        where: { 
          tanggal: targetDate, 
          mesinId: { in: machineIds },
          ...(plant ? { OR: plantPairs } : {})
        },
      }),
      prisma.laporanRealisasiProduksi.findMany({
        where: { 
          tanggal: targetDate, 
          mesinId: { in: machineIds },
          ...(plant ? { rphId: { in: plantRphIds } } : {})
        },
      }),
      prisma.andonDowntimeShift.findMany({
        where: { 
          tanggal: targetDate, 
          mesinId: { in: machineIds },
          ...(plant ? { shiftId: { in: plantPairs.map(p => p.shiftId) } } : {})
        },
      }),
      prisma.rencanaProduksi.findMany({
        where: { 
          tanggal: targetDate, 
          mesinId: { in: machineIds },
          ...(plant ? { id: { in: plantRphIds } } : {})
        },
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

    const totalOk = mcLrp.reduce((sum, l) => sum + (l.qtyOk || 0), 0);
    const totalNg = mcLrp.reduce(
      (sum, l) => sum + (l.qtyNgProses || 0) + (l.qtyNgPrev || 0),
      0,
    );
    const totalDowntime = mcDt.reduce((sum, d) => sum + (d.durasiMenit || 0), 0);
    const totalTarget = mcRencana.reduce(
      (sum, r) => sum + (r.target ? r.target.totalTarget : 0),
      0,
    );

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

    return {
      machineName: mesin.namaMesin,
      ok: totalOk,
      ng: totalNg,
      downtime: Number(totalDowntime.toFixed(1)),
      target: totalTarget,
      summary,
    };
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
