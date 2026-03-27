import prisma from "../../prisma/index.js";
import moment from "moment";

/**
 * Get KPI Summary for OEE Dashboard
 * @param {string} tanggal - YYYY-MM-DD
 * @param {string} [plant]
 */
const getOEESummary = async (tanggal, plant) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  let where = { tanggal: targetDate };

  if (plant) {
    // Filter machines associated with this plant via RencanaProduksi -> User
    const rencanaInPlant = await prisma.rencanaProduksi.findMany({
      where: {
        user: { plant: plant },
        tanggal: targetDate,
      },
      select: { mesinId: true },
      distinct: ["mesinId"],
    });
    const machineIds = rencanaInPlant.map((r) => r.mesinId);
    where.mesinId = { in: machineIds };
  }

  const oeeData = await prisma.oEE.findMany({
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
    // Fallback to simple average if loading_time is missing
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

const determineStatus = (oee) => {
  if (oee >= 85) return "EXCELLENT";
  if (oee >= 75) return "GOOD";
  if (oee >= 65) return "NEEDS_ATTENTION";
  return "CRITICAL";
};

/**
 * Get OEE Trend for Line Chart
 */
const getOEETrend = async (tanggal, shiftIds) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  let where = { tanggal: targetDate };
  if (shiftIds && shiftIds.length > 0) {
    const ids = Array.isArray(shiftIds)
      ? shiftIds.map(Number)
      : [Number(shiftIds)];
    where.shiftId = { in: ids };
  }

  const oeeRecords = await prisma.oEE.findMany({
    where,
    select: {
      shiftId: true,
      oeeScore: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const trendData = {}; // { shift_1: { "08": [scores] } }
  const allHours = new Set();

  oeeRecords.forEach((item) => {
    const shiftKey = `shift_${item.shiftId}`;
    const hour = moment(item.createdAt).format("HH");
    allHours.add(hour);

    if (!trendData[shiftKey]) trendData[shiftKey] = {};
    if (!trendData[shiftKey][hour]) trendData[shiftKey][hour] = [];
    trendData[shiftKey][hour].push(item.oeeScore);
  });

  const sortedHours = Array.from(allHours).sort();
  const response = { labels: sortedHours };

  // Shifts usually 1, 2, 3
  [1, 2, 3].forEach((id) => {
    const key = `shift_${id}`;
    response[key] = sortedHours.map((hour) => {
      const scores = trendData[key] ? trendData[key][hour] : null;
      if (!scores || scores.length === 0) return 0;
      return Number(
        (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1),
      );
    });
  });

  return response;
};

/**
 * Get Downtime History for Bar Chart
 */
const getDowntimeHistory = async (tanggal, plant) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  const where = {
    tanggal: targetDate,
    status: "RESOLVED",
  };
  if (plant) where.plant = plant;

  const andonEvents = await prisma.andonEvent.findMany({
    where,
    include: {
      masterMasalahAndon: true,
    },
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

/**
 * Get OEE Machine Detail Table
 */
const getMachineDetail = async (tanggal, plant) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  // 1. Get Machines
  let machineWhere = {};
  if (plant) {
    machineWhere.rencanaProduksi = {
      some: { user: { plant }, tanggal: targetDate },
    };
  }
  const machines = await prisma.mesin.findMany({
    where: machineWhere,
  });

  const machineIds = machines.map((m) => m.id);

  // 2. Fetch all supporting data in parallel
  const [oeeRecords, lrpRecords, downtimeShifts, rencanaProduksis] =
    await Promise.all([
      prisma.oEE.findMany({
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

  // 3. Process and merge
  return machines.map((mesin) => {
    const mcOee = oeeRecords.filter((r) => r.mesinId === mesin.id);
    const mcLrp = lrpRecords.filter((r) => r.mesinId === mesin.id);
    const mcDt = downtimeShifts.filter((r) => r.mesinId === mesin.id);
    const mcRencana = rencanaProduksis.filter(
      (r) => r.mesinId === mesin.id,
    );

    const shifts = {};
    [1, 2, 3].forEach((shiftId) => {
      const shiftKey = `shift_${shiftId}`;
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

    return {
      mesin: mesin.namaMesin,
      shift: shifts,
      summary,
    };
  });
};

export default {
  getOEESummary,
  getOEETrend,
  getDowntimeHistory,
  getMachineDetail,
};
