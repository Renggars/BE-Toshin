import moment from "moment-timezone";
import prisma from "../../prisma/index.js";
import { nowWIB } from "../utils/dateWIB.js";
import { emitOeeUpdate } from "../config/socket.js";

/**
 * Dipanggil setiap kali LRP di-submit atau di-update.
 * Menghitung OEE untuk satu RPH spesifik dan menyimpannya ke oee_rph.
 */
const recalculateByRph = async (rphId) => {
  // 1. Load RPH beserta relasi
  const rph = await prisma.rencanaProduksi.findUnique({
    where: { id: Number(rphId) },
    include: {
      laporanRealisasiProduksi: true,
      shift: true,
    },
  });

  if (!rph) return null;

  const lrp = rph.laporanRealisasiProduksi;
  if (!lrp) return null;

  const dateStr = moment(rph.tanggal).format("YYYY-MM-DD");
  const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

  // Re-fetch untuk pastikan endTime sudah committed (solve timing issue)
  const freshRph = await prisma.rencanaProduksi.findUnique({
    where: { id: Number(rphId) },
    select: { status: true, endTime: true, startTime: true },
  });

  // Re-fetch attendance secara fresh
  const freshAttendance = await prisma.attendance.findFirst({
    where: { rphId: Number(rphId) },
    orderBy: { jamTap: "asc" },
  });

  //  Tentukan window waktu RPH ini
  // Pakai yang paling awal antara attendance dan startTime
  const windowStart = freshAttendance?.jamTap && freshRph.startTime
    ? new Date(Math.min(
        new Date(freshAttendance.jamTap).getTime(),
        new Date(freshRph.startTime).getTime()
      ))
    : freshAttendance?.jamTap || freshRph.startTime;
  const windowEnd = freshRph.endTime
    || (freshRph.status === "ACTIVE" ? nowWIB() : lrp.updatedAt);

  if (!windowStart || !windowEnd) return null;

  const TZ = "Asia/Jakarta";
  const startMoment = moment(windowStart).tz(TZ);
  const endMoment   = moment(windowEnd).tz(TZ);

  const totalTimeMinutes = Math.max(
    0,
    endMoment.diff(startMoment, "minutes", true)
  );

  // 3. Ambil downtime dalam window RPH ini
  const downtimeData = await prisma.andonDowntimeShift.findMany({
    where: {
      mesinId: rph.mesinId,
      tanggal: targetDate,
      waktuStart: { lt: endMoment.toDate() },   // start sebelum window end
      waktuEnd:   { gt: startMoment.toDate() },  // end setelah window start
    },
    include: {
      andonEvent: { include: { masterMasalahAndon: true } },
    },
  });

  let plannedDowntime   = 0;
  let unplannedDowntime = 0;

  downtimeData.forEach((d) => {
    const dStart     = new Date(d.waktuStart).getTime();
    const dEnd       = new Date(d.waktuEnd).getTime();
    const wStartMs   = startMoment.toDate().getTime();
    const wEndMs     = endMoment.toDate().getTime();

    const clippedStart = Math.max(dStart, wStartMs);
    const clippedEnd   = Math.min(dEnd,   wEndMs);
    const clippedMin   = Math.max(0, (clippedEnd - clippedStart) / 60000);

    if (d.andonEvent?.masterMasalahAndon?.kategori === "PLAN_DOWNTIME") {
      plannedDowntime += clippedMin; ;
    } else {
      unplannedDowntime += clippedMin; ;
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
    loadingTime:    Number(loadingTime.toFixed(4)),
    downtime:       Number(downtime.toFixed(4)),
    plannedDowntime: Number(plannedDowntime.toFixed(4)),
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