// src/services/lrp.service.js

import prisma from "../../prisma/index.js";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";
import oeeService from "./oee.service.js";

/**
 * Create LRP
 */
const createLrp = async (lrpBody) => {
  const { logs, ...data } = lrpBody;

  // 1. Validasi ID RPH
  if (!data.fk_id_rph) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "ID Rencana Produksi (fk_id_rph) wajib diisi",
    );
  }

  const rph = await prisma.rencanaProduksi.findUnique({
    where: { id: data.fk_id_rph },
    include: { target: true, shift: true },
  });

  if (!rph) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Rencana Produksi tidak ditemukan",
    );
  }

  // 2. State Guardrails: LRP hanya untuk RPH yang sudah CLOSED
  if (rph.status !== "CLOSED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "LRP hanya dapat dibuat untuk Rencana Produksi (RPH) yang berstatus CLOSED. Lakukan RPH Switch atau selesaikan shift terlebih dahulu.",
    );
  }

  // 3. Enforce 1:1 Mapping
  const existingLrp = await prisma.laporanRealisasiProduksi.findUnique({
    where: { fk_id_rph: data.fk_id_rph },
  });
  if (existingLrp) {
    throw new ApiError(
      httpStatus.CONFLICT,
      "LRP untuk Rencana Produksi ini sudah pernah dibuat (Strict 1:1 Mapping)",
    );
  }

  // 4. Konsistensi Data (Optional but recommended for integrity)
  if (
    rph.fk_id_mesin !== data.fk_id_mesin ||
    rph.fk_id_shift !== data.fk_id_shift ||
    moment(rph.tanggal).format("YYYY-MM-DD") !==
      moment(data.tanggal).format("YYYY-MM-DD")
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Data Mesin, Shift, atau Tanggal pada LRP tidak sesuai dengan Rencana Produksi (RPH) yang direferensikan",
    );
  }

  // 5. Hitung loading time (Gunakan shift dari RPH)
  // Perhitungan loading_time mengikuti durasi RPH (start_time ke end_time)
  // atau standard loading time shift jika start/end tidak tersedia.
  // Sesuai rule: loading_time belong exclusively to that RPH.
  let loading_time = 0;
  if (rph.start_time && rph.end_time) {
    loading_time = Math.ceil(
      (new Date(rph.end_time) - new Date(rph.start_time)) / 60000,
    );
  } else {
    // Fallback ke standard shift calculation jika data waktu tidak lengkap
    loading_time = calculateLoadingTimeFromShift(rph.shift);
  }

  // 6. Hitung total produksi
  const qty_total_prod =
    Number(data.qty_ok || 0) +
    Number(data.qty_ng_proses || 0) +
    Number(data.qty_rework || 0);

  // 7. Simpan LRP
  const lrp = await prisma.laporanRealisasiProduksi.create({
    data: {
      ...data,
      qty_total_prod,
      loading_time,
      cycle_time: rph.target.ideal_cycle_time || 0,
      logs: {
        create: logs,
      },
    },
    include: { logs: true },
  });

  // 8. Sync ke OEE
  await oeeService.recalculateByMesin(lrp.fk_id_mesin, lrp.tanggal);

  return lrp;
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
  if (filter.fk_id_shift) where.fk_id_shift = parseInt(filter.fk_id_shift);
  if (filter.no_kanagata) where.no_kanagata = { contains: filter.no_kanagata };

  const lrps = await prisma.laporanRealisasiProduksi.findMany({
    where,
    skip,
    take: limit,
    orderBy: options.sortBy
      ? { [options.sortBy]: "desc" }
      : { created_at: "desc" },
    include: {
      operator: true,
      mesin: true,
      shift: true,
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
      logs: true,
      operator: true,
      mesin: true,
      shift: true,
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

  // Update LRP
  const updatedLrp = await prisma.laporanRealisasiProduksi.update({
    where: { id: lrpId },
    data: updateBody,
    include: { logs: true }, // Needed for syncOee
  });

  // Sync OEE (Recalculate)
  if (
    updateBody.qty_ok !== undefined ||
    updateBody.qty_ng_proses !== undefined ||
    updateBody.qty_ng_prev !== undefined ||
    updateBody.qty_rework !== undefined
  ) {
    // If quantity changed, we must re-sync OEE
    await oeeService.recalculateByMesin(
      updatedLrp.fk_id_mesin,
      updatedLrp.tanggal,
    );
  }

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

  // Re-sync OEE because data is gone
  await oeeService.recalculateByMesin(lrp.fk_id_mesin, lrp.tanggal);

  return lrp;
};

/**
 * Get Dashboard Stats
 * @returns {Promise<Object>}
 */
const getDashboardStats = async () => {
  // 1. Total OK vs NG (All time? Or Today?)
  // Assuming All time for now, or maybe last 30 days is better for charts.
  // Let's do aggregations.

  const aggregations = await prisma.laporanRealisasiProduksi.aggregate({
    _sum: {
      qty_ok: true,
      qty_ng_proses: true,
      qty_rework: true,
      total_downtime: true,
    },
  });

  // 2. Trend Produksi Harian (Last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dailyTrend = await prisma.laporanRealisasiProduksi.groupBy({
    by: ["tanggal"],
    where: {
      tanggal: {
        gte: sevenDaysAgo,
      },
    },
    _sum: {
      qty_total_prod: true,
    },
    orderBy: {
      tanggal: "asc",
    },
  });

  // 3. Total Downtime per Kategori
  // Need to aggregate on logs
  const downtimeStats = await prisma.lrpLog.groupBy({
    by: ["kategori_downtime"],
    _sum: {
      durasi_menit: true,
    },
  });

  return {
    summary: {
      total_ok: aggregations._sum.qty_ok || 0,
      total_ng: aggregations._sum.qty_ng_proses || 0,
      total_rework: aggregations._sum.qty_rework || 0,
      total_downtime_minutes: aggregations._sum.total_downtime || 0,
    },
    daily_trend: dailyTrend.map((d) => ({
      date: d.tanggal,
      total: d._sum.qty_total_prod,
    })),
    downtime_distribution: downtimeStats,
  };
};

export default {
  createLrp,
  queryLrps,
  getLrpById,
  updateLrpById,
  deleteLrpById,
  getDashboardStats,
};
