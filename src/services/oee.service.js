import moment from "moment";
import prisma from "../../prisma/index.js";
import { nowWIB } from "../utils/dateWIB.js";

import { emitOeeUpdate } from "../config/socket.js";

/**
 * Aggregate semua oee_rph untuk mesin + tanggal menjadi satu record oee harian.
 * Dipanggil oleh cron job, bukan lagi event-driven per LRP submit.
 */
const recalculateByMesin = async (mesinId, date = new Date()) => {
  const dateStr    = moment(date).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  // Ambil semua oee_rph yang sudah dihitung untuk mesin + tanggal ini
  const rphRecords = await prisma.oeeRph.findMany({
    where: { mesinId: Number(mesinId), tanggal: targetDate },
  });

  if (rphRecords.length === 0) return null;

  // Aggregate: sum loading time, downtime, output, ok
  let totalLoadingTime = 0;
  let totalDowntime    = 0;
  let totalOutput      = 0;
  let totalOk          = 0;
  let totalExpectedTime = 0; // untuk weighted performance

  rphRecords.forEach((r) => {
    totalLoadingTime  += r.loadingTime   || 0;
    totalDowntime     += r.downtime      || 0;
    totalOutput       += r.totalOutput   || 0;
    totalOk           += r.totalOk       || 0;
    totalExpectedTime += r.expectedTime  || 0; // ← pakai nilai presisi dari oee_rph
  });

  const totalRuntime = Math.max(0, totalLoadingTime - totalDowntime);

  // Hitung ulang dari total — bukan average sederhana, supaya akurat
  const availability = totalLoadingTime > 0
    ? (totalRuntime / totalLoadingTime) * 100 : 0;

  const performance  = totalRuntime > 0
    ? (totalExpectedTime / totalRuntime) * 100 : 0;

  const quality      = totalOutput > 0
    ? (totalOk / totalOutput) * 100 : 0;

  const oeeScore = (availability / 100) * (performance / 100) * (quality / 100) * 100;

  // Weighted average cycle time harian
  const weightedCycleTime = rphRecords
    .filter(r => r.idealCycleTime && r.totalOutput > 0)
    .reduce((acc, r) => acc + r.idealCycleTime * r.totalOutput, 0);
  const idealCycleTime = totalOutput > 0
    ? Number((weightedCycleTime / totalOutput).toFixed(3))
    : null;

  const payload = {
    availability:  Number(availability.toFixed(1)),
    performance:   Number(performance.toFixed(1)),
    quality:       Number(quality.toFixed(1)),
    oeeScore:      Number(oeeScore.toFixed(1)),
    loadingTime:   Number(totalLoadingTime.toFixed(4)),
    downtime:      Number(totalDowntime.toFixed(4)),
    totalOutput,
    totalOk,
    idealCycleTime,
  };

  const oeeRecord = await prisma.oee.upsert({
    where: {
      mesinId_tanggal: { mesinId: Number(mesinId), tanggal: targetDate },
    },
    update: payload,
    create: {
      ...payload,
      mesinId: Number(mesinId),
      tanggal: targetDate,
      createdAt: nowWIB(),
    },
  });

  emitOeeUpdate({ mesinId, tanggal: dateStr, oee: oeeRecord });

  return oeeRecord;
};

const getOEEByMesin = (mesinId) =>
  prisma.oee.findMany({ where: { mesinId: Number(mesinId) } });

const getOEEByShift = () => {
  // OEE is now per machine per day (aggregated across shifts).
  // This function is no longer relevant for specific shift filtering in the Oee table.
  return [];
};

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
      tanggal: targetDate, // Already filtered by tanggal in 'where', but OEE record is per mesin+tanggal
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
    oee: Number((oeeData.reduce((s, i) => s + i.oeeScore, 0) / count).toFixed(1)),
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
      tanggal: r.tanggal,
    }));
  }

  // Note: shiftId filtering is removed as OEE is now daily aggregated.
  // if (shiftIds && shiftIds.length > 0) { ... }

  const oeeRecords = await prisma.oee.findMany({
    where,
    select: { oeeScore: true, tanggal: true },
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

  const where = {
    tanggal: targetDate,
    status: "RESOLVED",
    masterMasalahAndon: {
      kategori: {
        not: "PLAN_DOWNTIME",
      },
    },
  };
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

  const [oeeRecords, lrpRecords, rencanaProduksis] =
    await Promise.all([
      prisma.oee.findMany({
        where: { 
          tanggal: targetDate, 
          mesinId: { in: machineIds },
        },
      }),
      prisma.laporanRealisasiProduksi.findMany({
        where: { 
          tanggal: targetDate, 
          mesinId: { in: machineIds },
          ...(plant ? { rphId: { in: plantRphIds } } : {})
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
    const mcRencana = rencanaProduksis.filter(
      (r) => r.mesinId === mesin.id,
    );

    const totalOk = mcLrp.reduce((sum, l) => sum + (l.qtyOk || 0), 0);
    const totalNg = mcLrp.reduce(
      (sum, l) => sum + (l.qtyNgProses || 0) + (l.qtyNgPrev || 0),
      0,
    );
    const totalDowntime = mcOee.reduce((sum, d) => sum + (d.downtime || 0), 0);
    const totalTarget = mcRencana.reduce(
      (sum, r) => sum + (r.target ? r.target.totalTarget : 0),
      0,
    );

    const count = mcOee.length;
    const summary =
      count > 0
        ? {
            availability: Number(
              (mcOee.reduce((s, r) => s + r.availability, 0) / count).toFixed(
                1,
              ),
            ),
            performance: Number(
              (mcOee.reduce((s, r) => s + r.performance, 0) / count).toFixed(1),
            ),
            quality: Number(
              (mcOee.reduce((s, r) => s + r.quality, 0) / count).toFixed(1),
            ),
            oee: Number(
              (mcOee.reduce((s, r) => s + r.oeeScore, 0) / count).toFixed(1),
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

/**
 * New Service: Detail Analytics Per RPH/Event logic (On-the-fly calculation)
 */
const getOeeEventDetail = async (mesinId, tanggal) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  // 1. Get all RPHs for this machine and date
  const rphs = await prisma.rencanaProduksi.findMany({
    where: { mesinId: Number(mesinId), tanggal: targetDate },
    include: {
      produk: true,
      shift: true,
      laporanRealisasiProduksi: true,
      attendance: { orderBy: { jamTap: "asc" }, take: 1 },
    },
    orderBy: { id: "asc" },
  });

  // 2. Get all Downtime for this machine and date
  const downtimeData = await prisma.andonDowntimeShift.findMany({
    where: { mesinId: Number(mesinId), tanggal: targetDate },
    include: {
      andonEvent: { include: { masterMasalahAndon: true } },
    },
  });

  const now = moment(nowWIB());

  // 3. Process each RPH event
  const events = rphs.map((rph) => {
    const lrp = rph.laporanRealisasiProduksi;
    if (!lrp) return null;

    // Window boundaries
    const start = rph.attendance?.[0]?.jamTap || rph.startTime;
    const end = rph.endTime || (rph.status === "ACTIVE" ? nowWIB() : lrp.updatedAt);

    if (!start || !end) return null;

    const startMoment = moment(start);
    const endMoment = moment(end);
    const totalMinutes = Math.max(0, endMoment.diff(startMoment, "minutes", true));

    // Filter downtime that occurred within this RPH window
    // (In our system, andonDowntimeShift already has startTime/endTime)
    // Note: This is an approximation if downtime spans across RPH transitions.
    const rphDowntime = downtimeData.filter(d => {
      const dStart = moment(d.startTime);
      return dStart.isSameOrAfter(startMoment) && dStart.isBefore(endMoment);
    });

    let plannedDt = 0;
    let unplannedDt = 0;
    rphDowntime.forEach(d => {
      if (d.andonEvent?.masterMasalahAndon?.kategori === "PLAN_DOWNTIME") {
        plannedDt += d.durasiMenit;
      } else {
        unplannedDt += d.durasiMenit;
      }
    });

    const loadingTime = Math.max(0, totalMinutes - plannedDt);
    const runtime = Math.max(0, loadingTime - unplannedDt);

    const qtyOk = lrp.qtyOk || 0;
    const qtyTotal = lrp.qtyTotalProd || 0;
    const cycleTime = lrp.cycleTime || 0;
    const expectedTime = cycleTime * qtyTotal;

    const availability = loadingTime > 0 ? (runtime / loadingTime) * 100 : 0;
    const performance = runtime > 0 ? (expectedTime / runtime) * 100 : 0;
    const quality = qtyTotal > 0 ? (qtyOk / qtyTotal) * 100 : 0;

    return {
      rphId: rph.id,
      produk: rph.produk.namaProduk,
      shift: rph.shift?.namaShift,
      startTime: startMoment.toISOString(),
      endTime: endMoment.toISOString(),
      duration: Number(totalMinutes.toFixed(1)),
      qtyOk,
      qtyNg: qtyTotal - qtyOk,
      downtime: Number(unplannedDt.toFixed(1)),
      plannedDowntime: Number(plannedDt.toFixed(1)),
      oee: {
        availability: Number(availability.toFixed(1)),
        performance: Number(performance.toFixed(1)),
        quality: Number(quality.toFixed(1)),
        oeeScore: Number(((availability / 100) * (performance / 100) * (quality / 100) * 100).toFixed(1)),
      }
    };
  }).filter(e => e !== null);

  return events;
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
  getOeeEventDetail,
};
