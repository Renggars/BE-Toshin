import moment from "moment";
import prisma from "../../prisma/index.js";
import { nowWIB } from "../utils/dateWIB.js";
import { emitOeeUpdate } from "../config/socket.js";

/**
 * Dipanggil setiap kali LRP di-submit atau di-update.
 * Menghitung OEE untuk satu RPH spesifik dan menyimpannya ke oee_rph.
 */
const recalculateByRph = async (rphId) => {
  // 1. Load RPH beserta relasi yang dibutuhkan
  const rph = await prisma.rencanaProduksi.findUnique({
    where: { id: Number(rphId) },
    include: {
      laporanRealisasiProduksi: true,
      attendance: { orderBy: { jamTap: "asc" }, take: 1 },
      shift: true,
    },
  });

  if (!rph) return null;

  const lrp = rph.laporanRealisasiProduksi;
  if (!lrp) return null;

  const dateStr = moment(rph.tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  // 2. Tentukan window waktu RPH ini
  const windowStart = rph.attendance?.[0]?.jamTap || rph.startTime;
  const windowEnd   = rph.endTime
    || (rph.status === "ACTIVE" ? nowWIB() : lrp.updatedAt);

  if (!windowStart || !windowEnd) return null;

  const startMoment = moment(windowStart);
  const endMoment   = moment(windowEnd);

  const totalTimeMinutes = Math.max(
    0,
    endMoment.diff(startMoment, "minutes", true)
  );

  // 3. Ambil downtime yang jatuh dalam window RPH ini
  const downtimeData = await prisma.andonDowntimeShift.findMany({
    where: {
      mesinId: rph.mesinId,
      tanggal: targetDate,
      waktuStart: {
        gte: startMoment.toDate(),
        lt: endMoment.toDate(),
      },
    },
    include: {
      andonEvent: { include: { masterMasalahAndon: true } },
    },
  });

  let plannedDowntime   = 0;
  let unplannedDowntime = 0;

  downtimeData.forEach((d) => {
    if (d.andonEvent?.masterMasalahAndon?.kategori === "PLAN_DOWNTIME") {
      plannedDowntime += d.durasiMenit || 0;
    } else {
      unplannedDowntime += d.durasiMenit || 0;
    }
  });

  // 4. Hitung metrik
  const loadingTime = Math.max(0, totalTimeMinutes - plannedDowntime);
  const downtime    = Math.max(0, unplannedDowntime);
  const runtime     = Math.max(0, loadingTime - downtime);

  const qtyOk    = Number(lrp.qtyOk)        || 0;
  const qtyTotal = Number(lrp.qtyTotalProd)  || 0;
  const cycleTime = Number(lrp.cycleTime)    || 0;
  const expectedProductionTime = cycleTime * qtyTotal;

  const availability = loadingTime > 0 ? (runtime / loadingTime) * 100 : 0;
  const performance  = runtime > 0 ? (expectedProductionTime / runtime) * 100 : 0;
  const quality      = qtyTotal > 0 ? (qtyOk / qtyTotal) * 100 : 0;
  const oeeScore     = (availability / 100) * (performance / 100) * (quality / 100) * 100;

  const payload = {
    mesinId:        rph.mesinId,
    shiftId:        rph.shiftId ?? null,
    tanggal:        targetDate,
    windowStart:    startMoment.toDate(),
    windowEnd:      endMoment.toDate(),
    availability:   Number(availability.toFixed(1)),
    performance:    Number(performance.toFixed(1)),
    quality:        Number(quality.toFixed(1)),
    oeeScore:       Number(oeeScore.toFixed(1)),
    loadingTime:    Number(loadingTime.toFixed(1)),
    downtime:       Number(downtime.toFixed(1)),
    plannedDowntime: Number(plannedDowntime.toFixed(1)),
    expectedTime:    Number(expectedProductionTime.toFixed(4)),
    totalOutput:    qtyTotal,
    totalOk:        qtyOk,
    idealCycleTime: cycleTime > 0 ? Number(cycleTime.toFixed(3)) : null,
  };

  // 5. Upsert oee_rph (unique by rphId)
  const oeeRphRecord = await prisma.oeeRph.upsert({
    where:  { rphId: Number(rphId) },
    update: payload,
    create: { ...payload, rphId: Number(rphId) },
  });

  // 6. Emit socket supaya dashboard per-RPH bisa realtime
  emitOeeUpdate({
    type:   "rph",
    rphId,
    mesinId: rph.mesinId,
    tanggal: dateStr,
    oee:    oeeRphRecord,
  });

  return oeeRphRecord;
};

/**
 * Ambil semua oee_rph untuk mesin + tanggal tertentu (untuk UI detail per shift).
 */
const getOeeRphByMesinAndDate = async (mesinId, tanggal) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  return prisma.oeeRph.findMany({
    where: { mesinId: Number(mesinId), tanggal: targetDate },
    include: {
      rencanaProduksi: {
        include: { produk: true, shift: true },
      },
    },
    orderBy: { windowStart: "asc" },
  });
};

/**
 * Ambil oee_rph difilter by shift (untuk tampilan OEE per shift di UI).
 */
const getOeeRphByShift = async (tanggal, shiftId, mesinId = null) => {
  const dateStr = moment(tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  const where = {
    tanggal: targetDate,
    shiftId: Number(shiftId),
    ...(mesinId ? { mesinId: Number(mesinId) } : {}),
  };

  return prisma.oeeRph.findMany({
    where,
    include: {
      mesin: true,
      shift: true,
      rencanaProduksi: { include: { produk: true } },
    },
    orderBy: [{ mesinId: "asc" }, { windowStart: "asc" }],
  });
};

export default {
  recalculateByRph,
  getOeeRphByMesinAndDate,
  getOeeRphByShift,
};