// src/services/lrp.service.js

import prisma from "../../prisma/index.js";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";
import moment from "moment";
import calculateLoadingTimeFromShift from "../utils/calculateLoadingTimeFromShift.js";
import { oeeQueue } from "../queues/oeeQueue.js";
import { nowWIB } from "../utils/dateWIB.js";
import oeeService from "./oee.service.js";
import { emitOperatorProgressUpdate } from "../config/socket.js";

/**
 * Helper: enqueue OEE recalculation job dengan dedup + delay.
 * jobId = `oee-{mesinId}-{YYYY-MM-DD}` → burst LRP untuk mesin + hari yang
 * sama hanya akan trigger 1 recalc setelah window delay 3 detik selesai.
 */
const enqueueOeeRecalc = async (mesinId, tanggal) => {
  // Jika Redis mati, lakukan kalkulasi langsung (fallback)
  if (!oeeQueue) {
    console.info(`[OEE] Redis disabled, performing manual recalculation for machine ${mesinId}`);
    await oeeService.recalculateByMesin(mesinId, tanggal);
    return;
  }
  // Normalize ke YYYY-MM-DD agar jobId selalu konsisten
  // (tanggal bisa berupa Date object atau ISO string)
  const tanggalStr = moment(tanggal).format("YYYY-MM-DD");

  await oeeQueue.add(
    "oee-recalc",
    { mesinId, tanggal: tanggalStr },
    {
      jobId: `oee-${mesinId}-${tanggalStr}`, // kunci dedup
      delay: 3000, // tunggu 3 detik (window dedup)
    },
  );
};

/**
 * Upsert LRP by RPH ID — Buat DRAFT jika belum ada, update jika sudah ada.
 * Dapat dipanggil kapan saja selama shift (berkala / saat istirahat).
 * RPH tidak pernah ditutup di sini.
 *
 * @param {number} rphId  - ID Rencana Produksi Harian
 * @param {Object} data   - Body dari request (qty, noKanagata, noLot, dll)
 * @returns {Promise<LaporanRealisasiProduksi>}
 */
const upsertLrpByRphId = async (rphId, data) => {
  const parsedRphId = parseInt(rphId);

  // === Cek apakah LRP sudah ada untuk RPH ini ===
  const existingLrp = await prisma.laporanRealisasiProduksi.findUnique({
    where: { rphId: parsedRphId },
  });

  if (existingLrp) {
    // ─── UPDATE PATH ────────────────────────────────────────────────────────
    // Guard: LRP yang sudah SUBMITTED tidak dapat diubah lagi.
    if (existingLrp.statusLrp === "SUBMITTED") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "LRP sudah final (SUBMITTED) dan tidak dapat diubah. Gunakan POST /lrp/:id/submit untuk finalisasi.",
      );
    }

    // Recalculate qtyTotalProd dengan data existing sebagai fallback (no extra query)
    const qtyOk      = data.qtyOk      !== undefined ? Number(data.qtyOk)      : existingLrp.qtyOk;
    const qtyNgProses = data.qtyNgProses !== undefined ? Number(data.qtyNgProses) : existingLrp.qtyNgProses;
    const qtyRework  = data.qtyRework  !== undefined ? Number(data.qtyRework)  : existingLrp.qtyRework;
    const qtyNgPrev  = data.qtyNgPrev  !== undefined ? Number(data.qtyNgPrev)  : existingLrp.qtyNgPrev;
    const qtyTotalProd = qtyOk + qtyNgProses + qtyRework + qtyNgPrev;

    const updatedLrp = await prisma.laporanRealisasiProduksi.update({
      where: { rphId: parsedRphId },
      data: {
        ...(data.qtyOk       !== undefined && { qtyOk:      Number(data.qtyOk) }),
        ...(data.qtyNgProses !== undefined && { qtyNgProses: Number(data.qtyNgProses) }),
        ...(data.qtyNgPrev   !== undefined && { qtyNgPrev:  Number(data.qtyNgPrev) }),
        ...(data.qtyRework   !== undefined && { qtyRework:  Number(data.qtyRework) }),
        qtyTotalProd,
        ...(data.counterStart !== undefined && { counterStart: data.counterStart != null ? Number(data.counterStart) : null }),
        ...(data.counterEnd   !== undefined && { counterEnd:   data.counterEnd   != null ? Number(data.counterEnd)   : null }),
        ...(data.noKanagata && { noKanagata: data.noKanagata }),
        ...(data.noLot      && { noLot:      data.noLot }),
        updatedAt: nowWIB(),
      },
    });

    // OEE recalc — Mandor bisa pantau progress real-time di dashboard
    await enqueueOeeRecalc(updatedLrp.mesinId, updatedLrp.tanggal);

    // Real-time progress update for Mandor
    emitOperatorProgressUpdate({
      mesinId: updatedLrp.mesinId,
      shiftId: updatedLrp.shiftId,
      tanggal: updatedLrp.tanggal,
    });

    return updatedLrp;
  }

  // ─── CREATE PATH (LRP pertama kali untuk RPH ini) ───────────────────────
  // noKanagata dan noLot wajib diisi saat pertama kali input
  if (!data.noKanagata) {
    throw new ApiError(httpStatus.BAD_REQUEST, "noKanagata wajib diisi saat pertama kali input LRP");
  }
  if (!data.noLot) {
    throw new ApiError(httpStatus.BAD_REQUEST, "noLot wajib diisi saat pertama kali input LRP");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Ambil RPH beserta relasi yang dibutuhkan
    const rph = await tx.rencanaProduksi.findUnique({
      where: { id: parsedRphId },
      include: {
        target: true,
        shift: true,
        operator: { select: { noReg: true } }, // noReg operator bisa di-derive dari RPH
      },
    });

    if (!rph) {
      throw new ApiError(httpStatus.NOT_FOUND, "Rencana Produksi tidak ditemukan");
    }

    // Hanya RPH yang PLANNED atau ACTIVE yang boleh di-input LRP
    if (rph.status === "CLOSED") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "RPH sudah CLOSED. LRP tidak dapat dibuat untuk RPH yang sudah selesai.",
      );
    }

    // Hitung loading time dari startTime RPH atau fallback ke durasi shift
    let loadingTime = 0;
    if (rph.startTime) {
      loadingTime = Math.ceil((nowWIB() - new Date(rph.startTime)) / 60000);
    } else {
      loadingTime = calculateLoadingTimeFromShift(rph.shift);
    }

    const qtyOk      = Number(data.qtyOk      || 0);
    const qtyNgProses = Number(data.qtyNgProses || 0);
    const qtyNgPrev  = Number(data.qtyNgPrev   || 0);
    const qtyRework  = Number(data.qtyRework   || 0);
    const qtyTotalProd = qtyOk + qtyNgProses + qtyNgPrev + qtyRework;

    // Buat LRP dengan status DRAFT — semua identitas di-derive dari RPH
    const lrp = await tx.laporanRealisasiProduksi.create({
      data: {
        rphId:      parsedRphId,
        mesinId:    rph.mesinId,
        shiftId:    rph.shiftId,
        operatorId: rph.userId,
        tanggal:    rph.tanggal,
        noReg:      rph.operator?.noReg || data.noReg || "",
        noKanagata: data.noKanagata,
        noLot:      data.noLot,
        qtyOk,
        qtyNgProses,
        qtyNgPrev,
        qtyRework,
        qtyTotalProd,
        loadingTime,
        cycleTime:    rph.target.idealCycleTime || 0,
        counterStart: data.counterStart != null ? Number(data.counterStart) : null,
        counterEnd:   data.counterEnd   != null ? Number(data.counterEnd)   : null,
        statusLrp:    "DRAFT",
        createdAt:    nowWIB(),
        updatedAt:    nowWIB(),
      },
    });

    return lrp;
  });

  // OEE recalc non-blocking setelah transaksi selesai
  await enqueueOeeRecalc(result.mesinId, result.tanggal);

  // Real-time progress update for Mandor
  emitOperatorProgressUpdate({
    mesinId: result.mesinId,
    shiftId: result.shiftId,
    tanggal: result.tanggal,
  });

  return result;
};

/**
 * Query for LRPs
 * @param {Object} filter
 * @param {Object} options - Limit, page, sortBy
 * @returns {Promise<QueryResult>}
 */
const queryLrps = async (filter, options) => {
  const page = options.page || 1;
  const limit = options.limit || 10;
  const skip = (page - 1) * limit;

  // Basic filtering
  const where = {};
  if (filter.tanggal) where.tanggal = new Date(filter.tanggal);
  if (filter.shiftId) where.shiftId = parseInt(filter.shiftId);
  if (filter.rphId) where.rphId = parseInt(filter.rphId);
  if (filter.noKanagata) where.noKanagata = { contains: filter.noKanagata };

  const lrps = await prisma.laporanRealisasiProduksi.findMany({
    where,
    skip,
    take: limit,
    orderBy: options.sortBy
      ? { [options.sortBy]: "desc" }
      : { createdAt: "desc" },
    include: {
      operator: true,
      mesin: true,
      shift: true,
      rencanaProduksi: {
        include: {
          produk: true,
          jenisPekerjaan: true,
        },
      },
    },
  });

  const total = await prisma.laporanRealisasiProduksi.count({ where });

  return {
    results: lrps,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    totalResults: total,
  };
};

/**
 * Get LRP by ID
 * @param {number} id
 */
const getLrpById = async (id) => {
  return prisma.laporanRealisasiProduksi.findUnique({
    where: { id },
    include: {
      operator: true,
      mesin: true,
      shift: true,
      rencanaProduksi: {
        include: {
          produk: true,
          jenisPekerjaan: true,
        },
      },
    },
  });
};

/**
 * Submit LRP (Simpan Final) — Update data terakhir, finalkan LRP, tutup RPH, dan cek tugas baru.
 * @param {number} lrpId
 * @param {Object} updateBody - Data qty terakhir (opsional)
 * @returns {{ lrp: LaporanRealisasiProduksi, next_rph: RencanaProduksi | null }}
 */
const submitLrpById = async (lrpId, updateBody = {}) => {
  const lrp = await getLrpById(lrpId);
  if (!lrp) {
    throw new ApiError(httpStatus.NOT_FOUND, "LRP not found");
  }

  // Guard: Jangan double-submit
  if (lrp.statusLrp === "SUBMITTED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "LRP sudah pernah di-submit sebelumnya.",
    );
  }

  // Jika ada updateBody, hitung ulang qtyTotalProd
  let finalData = { ...updateBody };
  if (
    updateBody.qtyOk !== undefined ||
    updateBody.qtyNgProses !== undefined ||
    updateBody.qtyNgPrev !== undefined ||
    updateBody.qtyRework !== undefined
  ) {
    const qtyOk = updateBody.qtyOk !== undefined ? Number(updateBody.qtyOk) : lrp.qtyOk;
    const qtyNgProses = updateBody.qtyNgProses !== undefined ? Number(updateBody.qtyNgProses) : lrp.qtyNgProses;
    const qtyRework = updateBody.qtyRework !== undefined ? Number(updateBody.qtyRework) : lrp.qtyRework;
    const qtyNgPrev = updateBody.qtyNgPrev !== undefined ? Number(updateBody.qtyNgPrev) : lrp.qtyNgPrev;

    finalData.qtyTotalProd = qtyOk + qtyNgProses + qtyRework + qtyNgPrev;
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update data terakhir & Finalkan LRP: status -> SUBMITTED
    const submittedLrp = await tx.laporanRealisasiProduksi.update({
      where: { id: lrpId },
      data: {
        ...finalData,
        statusLrp: "SUBMITTED",
        updatedAt: nowWIB(),
      },
    });

    // 2. Tutup RPH yang terkait: ACTIVE → CLOSED
    await tx.rencanaProduksi.update({
      where: { id: submittedLrp.rphId },
      data: { status: "CLOSED", endTime: nowWIB() },
    });

    // 3. Cek apakah ada RPH PLANNED berikutnya untuk operator yang sama
    //    pada hari yang sama. Ini memberitahu Frontend untuk mengarahkan
    //    operator ke tugas produksi berikutnya.
    const nextRph = await tx.rencanaProduksi.findFirst({
      where: {
        userId: submittedLrp.operatorId,
        status: "PLANNED",
        tanggal: submittedLrp.tanggal,
        id: { not: submittedLrp.rphId },
      },
      include: {
        mesin: { select: { id: true, namaMesin: true } },
        produk: { select: { id: true, namaProduk: true } },
        shift: { select: { id: true, namaShift: true, jamMasuk: true, jamKeluar: true } },
        target: { select: { totalTarget: true } },
      },
      orderBy: { id: "asc" },
    });

    return { lrp: submittedLrp, nextRph };
  });

  // 4. Trigger OEE recalc setelah transaksi selesai (non-blocking)
  await enqueueOeeRecalc(result.lrp.mesinId, result.lrp.tanggal);

  // Real-time progress update for Mandor
  emitOperatorProgressUpdate({
    mesinId: result.lrp.mesinId,
    shiftId: result.lrp.shiftId,
    tanggal: result.lrp.tanggal,
  });

  return {
    lrp: result.lrp,
    next_rph: result.nextRph
      ? {
          id: result.nextRph.id,
          mesin: result.nextRph.mesin.namaMesin,
          mesin_id: result.nextRph.mesin.id,
          produk: result.nextRph.produk.namaProduk,
          produk_id: result.nextRph.produk.id,
          shift: result.nextRph.shift.namaShift,
          jam: `${result.nextRph.shift.jamMasuk} - ${result.nextRph.shift.jamKeluar}`,
          total_target: result.nextRph.target.totalTarget,
        }
      : null,
  };
};

/**
 * Get Operator Progress for Mandor Dashboard
 * @param {Object} filter - plant, line, tanggal
 */
const getOperatorProgress = async (filter) => {
  const { plant, line, tanggal } = filter;
  const targetDate = tanggal
    ? moment.utc(tanggal).startOf("day").toDate()
    : moment().startOf("day").toDate();

  const activeRph = await prisma.rencanaProduksi.findMany({
    where: {
      tanggal: targetDate,
      // Kita ambil RPH yang PLANNED atau ACTIVE untuk melihat progres hari ini
      status: { in: ["PLANNED", "ACTIVE", "CLOSED"] },
      operator: {
        plant: plant,
        ...(line && { line: line }),
      },
    },
    include: {
      operator: { select: { id: true, nama: true, fotoProfile: true } },
      mesin: { select: { namaMesin: true } },
      produk: { select: { namaProduk: true } },
      jenisPekerjaan: { select: { namaPekerjaan: true } },
      target: { select: { totalTarget: true } },
      laporanRealisasiProduksi: { select: { qtyOk: true, updatedAt: true } },
    },
    orderBy: { id: "asc" },
  });

  return activeRph.map((rph) => {
    const qtyOk = rph.laporanRealisasiProduksi?.qtyOk || 0;
    const targetQty = rph.target?.totalTarget || 0;

    return {
      rphId: rph.id,
      operatorId: rph.operator.id,
      operatorName: rph.operator.nama,
      fotoProfile: rph.operator.fotoProfile,
      machineName: rph.mesin.namaMesin,
      productName: rph.produk.namaProduk,
      jobTypeName: rph.jenisPekerjaan?.namaPekerjaan || "-",
      qtyOk,
      targetQty,
      percentage: targetQty > 0 ? Math.min(100, Math.round((qtyOk / targetQty) * 100)) : 0,
      status: rph.status,
      lastUpdate: rph.laporanRealisasiProduksi?.updatedAt || null,
    };
  });
};

/**
 * Delete LRP
 * @param {number} lrpId
 * @returns {Promise<LaporanRealisasiProduksi>}
 */
const deleteLrpById = async (lrpId) => {
  const lrp = await getLrpById(lrpId);
  if (!lrp) {
    throw new ApiError(httpStatus.NOT_FOUND, "LRP not found");
  }

  // Delete
  await prisma.laporanRealisasiProduksi.delete({
    where: { id: lrpId },
  });

  // Enqueue OEE recalc karena data LRP sudah dihapus
  await enqueueOeeRecalc(lrp.mesinId, lrp.tanggal);

  return lrp;
};

/**
 * Update LRP by ID
 * @param {number} lrpId
 * @param {Object} updateBody
 * @returns {Promise<LaporanRealisasiProduksi>}
 */
const updateLrpById = async (lrpId, updateBody) => {
  const lrp = await getLrpById(lrpId);
  if (!lrp) {
    throw new ApiError(httpStatus.NOT_FOUND, "LRP not found");
  }

  let finalData = { ...updateBody };
  if (
    updateBody.qtyOk !== undefined ||
    updateBody.qtyNgProses !== undefined ||
    updateBody.qtyNgPrev !== undefined ||
    updateBody.qtyRework !== undefined
  ) {
    const qtyOk = updateBody.qtyOk !== undefined ? Number(updateBody.qtyOk) : lrp.qtyOk;
    const qtyNgProses = updateBody.qtyNgProses !== undefined ? Number(updateBody.qtyNgProses) : lrp.qtyNgProses;
    const qtyRework = updateBody.qtyRework !== undefined ? Number(updateBody.qtyRework) : lrp.qtyRework;
    const qtyNgPrev = updateBody.qtyNgPrev !== undefined ? Number(updateBody.qtyNgPrev) : lrp.qtyNgPrev;

    finalData.qtyTotalProd = qtyOk + qtyNgProses + qtyRework + qtyNgPrev;
  }

  const updatedLrp = await prisma.laporanRealisasiProduksi.update({
    where: { id: lrpId },
    data: {
      ...finalData,
      updatedAt: nowWIB(),
    },
  });

  // Enqueue OEE recalc karena data LRP berubah
  await enqueueOeeRecalc(updatedLrp.mesinId, updatedLrp.tanggal);

  // Real-time progress update for Mandor
  emitOperatorProgressUpdate({
    mesinId: updatedLrp.mesinId,
    shiftId: updatedLrp.shiftId,
    tanggal: updatedLrp.tanggal,
  });

  return updatedLrp;
};

export default {
  upsertLrpByRphId,
  queryLrps,
  getLrpById,
  submitLrpById,
  deleteLrpById,
  updateLrpById,
  getOperatorProgress,
};

