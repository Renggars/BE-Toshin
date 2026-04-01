// src/services/lrp.service.js

import prisma from "../../prisma/index.js";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";
import moment from "moment";
import calculateLoadingTimeFromShift from "../utils/calculateLoadingTimeFromShift.js";
import { oeeQueue } from "../queues/oeeQueue.js";

/**
 * Helper: enqueue OEE recalculation job dengan dedup + delay.
 * jobId = `oee-{mesinId}-{YYYY-MM-DD}` → burst LRP untuk mesin + hari yang
 * sama hanya akan trigger 1 recalc setelah window delay 3 detik selesai.
 */
const enqueueOeeRecalc = async (mesinId, tanggal) => {
  if (!oeeQueue) return;
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
 * Create LRP
 */
const createLrp = async (lrpBody) => {
  const data = lrpBody;

  // 1. Validasi ID RPH
  if (!data.rphId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "ID Rencana Produksi (rphId) wajib diisi",
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const rph = await tx.rencanaProduksi.findUnique({
      where: { id: data.rphId },
      include: { target: true, shift: true },
    });

    if (!rph) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Rencana Produksi tidak ditemukan",
      );
    }

    // 2. State Guardrails: LRP hanya untuk RPH yang ACTIVE atau CLOSED
    // RPH tetap ACTIVE agar downtime administrasi tetap masuk ke RPH ini
    if (rph.status !== "ACTIVE" && rph.status !== "CLOSED") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "LRP hanya dapat dibuat untuk Rencana Produksi (RPH) yang berstatus ACTIVE atau CLOSED.",
      );
    }

    // 3. Enforce 1:1 Mapping
    const existingLrp = await tx.laporanRealisasiProduksi.findUnique({
      where: { rphId: data.rphId },
    });
    if (existingLrp) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "LRP for this rphId already exists (Strict 1:1 Mapping)",
      );
    }

    // 4. Hitung loading time (Gunakan start_time ke end_time atau shift)
    let loadingTime = 0;
    const currentEnd = rph.endTime || new Date();
    if (rph.startTime) {
      loadingTime = Math.ceil(
        (new Date(currentEnd) - new Date(rph.startTime)) / 60000,
      );
    } else {
      loadingTime = calculateLoadingTimeFromShift(rph.shift);
    }

    // 5. Hitung total produksi
    const qtyTotalProd =
      Number(data.qtyOk || 0) +
      Number(data.qtyNgProses || 0) +
      Number(data.qtyRework || 0);

    // 6. Simpan LRP
    const lrp = await tx.laporanRealisasiProduksi.create({
      data: {
        rphId: data.rphId,
        mesinId: data.mesinId,
        shiftId: data.shiftId,
        operatorId: data.operatorId || data.userId,
        tanggal: data.tanggal ? new Date(data.tanggal) : undefined,
        keterangan: data.keterangan,
        qtyOk: Number(data.qtyOk || 0),
        qtyNgProses: Number(data.qtyNgProses || 0),
        qtyNgPrev: Number(data.qtyNgPrev || 0),
        qtyRework: Number(data.qtyRework || 0),
        qtyTotalProd,
        loadingTime,
        cycleTime: rph.target.idealCycleTime || 0,
        noReg: data.noReg || null,
        counterStart:
          data.counterStart != null ? Number(data.counterStart) : null,
        counterEnd: data.counterEnd != null ? Number(data.counterEnd) : null,
        noKanagata: data.noKanagata,
        noLot: data.noLot,
        updatedAt: new Date(),
      },
    });

    // 7. Auto-Close RPH: Ubah status menjadi CLOSED agar tidak bisa login/submit lagi
    await tx.rencanaProduksi.update({
      where: { id: data.rphId },
      data: {
        status: "CLOSED",
        endTime: new Date(),
      },
    });

    return lrp;
  });

  // 8. Enqueue OEE recalc ke background worker (non-blocking)
  // Response 201 sudah dikirim, recalc jalan setelah delay 3 detik
  await enqueueOeeRecalc(result.mesinId, result.tanggal);

  return result;
};

/**
 * Query for LRPs
 * @param {Object} filter - Mongo style filter? Prisma filter.
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
 * @returns {Promise<LaporanRealisasiProduksi>}
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
 * Update LRP
 * @param {number} lrpId
 * @param {Object} updateBody
 * @returns {Promise<LaporanRealisasiProduksi>}
 */
const updateLrpById = async (lrpId, updateBody) => {
  const lrp = await getLrpById(lrpId);
  if (!lrp) {
    throw new ApiError(httpStatus.NOT_FOUND, "LRP not found");
  }

  // Sync OEE (Recalculate) and Recalculate qtyTotalProd
  if (
    updateBody.qtyOk !== undefined ||
    updateBody.qtyNgProses !== undefined ||
    updateBody.qtyNgPrev !== undefined ||
    updateBody.qtyRework !== undefined
  ) {
    const qtyOk =
      updateBody.qtyOk !== undefined ? Number(updateBody.qtyOk) : await prisma.laporanRealisasiProduksi.findUnique({where: {id: lrpId}}).then(r => r.qtyOk);
    const qtyNgProses =
      updateBody.qtyNgProses !== undefined ? Number(updateBody.qtyNgProses) : await prisma.laporanRealisasiProduksi.findUnique({where: {id: lrpId}}).then(r => r.qtyNgProses);
    const qtyRework =
      updateBody.qtyRework !== undefined ? Number(updateBody.qtyRework) : await prisma.laporanRealisasiProduksi.findUnique({where: {id: lrpId}}).then(r => r.qtyRework);
    const qtyNgPrev =
      updateBody.qtyNgPrev !== undefined ? Number(updateBody.qtyNgPrev) : await prisma.laporanRealisasiProduksi.findUnique({where: {id: lrpId}}).then(r => r.qtyNgPrev);
    
    updateBody.qtyTotalProd = qtyOk + qtyNgProses + qtyRework + qtyNgPrev;

    // Update LRP first
    const updatedLrp = await prisma.laporanRealisasiProduksi.update({
      where: { id: lrpId },
      data: updateBody,
    });

    // Quantity berubah → enqueue OEE recalc ke background worker
    await enqueueOeeRecalc(updatedLrp.mesinId, updatedLrp.tanggal);
    return updatedLrp;
  }

  // Update LRP
  const updatedLrp = await prisma.laporanRealisasiProduksi.update({
    where: { id: lrpId },
    data: updateBody,
  });

  return updatedLrp;
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

  // Delete (Logs should cascade via Prisma/DB relation if configured,
  // schema says: lrpLog[] but usually relation onDelete: Cascade is needed in schema.
  // In existing schema: `logs LrpLog[]` and `laporan ... onDelete: Cascade` (Verified).
  await prisma.laporanRealisasiProduksi.delete({
    where: { id: lrpId },
  });

  // Enqueue OEE recalc karena data LRP sudah dihapus
  await enqueueOeeRecalc(lrp.mesinId, lrp.tanggal);

  return lrp;
};

export default {
  createLrp,
  queryLrps,
  getLrpById,
  updateLrpById,
  deleteLrpById,
};
