import prisma from "../../prisma/index.js";
import httpStatus from "http-status";
import xlsx from "xlsx";
import ApiError from "../utils/ApiError.js";

/**
 * Helper untuk membangun kueri filter Prisma
 * Mendukung: Rentang Tanggal, Tanggal Tunggal, Mesin, Shift, dan Search
 */
const buildFilterWhereClause = (filter) => {
  const where = {};

  // 1. Logika Tanggal (Single Date Only)
  if (filter.tanggal) {
    where.tanggal = new Date(filter.tanggal);
  }

  // 2. Filter ID (Foreign Keys)
  if (filter.fk_id_mesin) where.fk_id_mesin = Number(filter.fk_id_mesin);
  if (filter.fk_id_shift) where.fk_id_shift = Number(filter.fk_id_shift);

  // 3. Filter Plant (via Operator relation)
  if (filter.plant && filter.plant !== "Semua Plant") {
    where.operator = {
      plant: filter.plant,
    };
  }

  // 4. Pencarian (Optional)
  if (filter.no_kanagata)
    where.no_kanagata = { contains: filter.no_kanagata, mode: "insensitive" };
  if (filter.no_lot)
    where.no_lot = { contains: filter.no_lot, mode: "insensitive" };

  return where;
};

/**
 * Mendapatkan Statistik Ringkasan (Summary) Dashboard
 * Formula:
 * total_ok = SUM(qty_ok)
 * total_ng = SUM(qty_ng_prev + qty_ng_proses)
 * total_rework = SUM(qty_rework)
 * total_qty = total_ok + total_ng + total_rework
 * efisiensi = (total_ok / total_qty) * 100
 * laporan_hari_ini = COUNT(id)
 */
const getDashboardSummary = async (filter) => {
  const where = buildFilterWhereClause(filter);

  const aggregate = await prisma.laporanRealisasiProduksi.aggregate({
    where,
    _sum: {
      qty_ok: true,
      qty_ng_prev: true,
      qty_ng_proses: true,
      qty_rework: true,
    },
    _count: { id: true },
  });

  const total_ok = aggregate._sum.qty_ok || 0;
  const total_ng =
    (aggregate._sum.qty_ng_prev || 0) + (aggregate._sum.qty_ng_proses || 0);
  const total_rework = aggregate._sum.qty_rework || 0;

  // Total Quantity based on formula
  const total_qty = total_ok + total_ng + total_rework;
  const laporan_hari_ini = aggregate._count.id || 0;

  return {
    total_ok,
    total_ng,
    total_rework,
    total_qty,
    laporan_hari_ini,
  };
};

/**
 * Get Monthly Production Trend (Daily grouping for current month)
 * GET /lrp-dashboard/trend-bulanan-harian
 */
const getTrendBulananHarian = async (filter) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // Build base filter
  const baseWhere = buildFilterWhereClause(filter);
  delete baseWhere.tanggal; // Remove single date filter if present

  const where = {
    ...baseWhere,
    created_at: {
      gte: firstDay,
      lte: lastDay,
    },
  };

  const data = await prisma.laporanRealisasiProduksi.groupBy({
    by: ["tanggal"],
    _sum: {
      qty_ok: true,
      qty_ng_prev: true,
      qty_ng_proses: true,
      qty_rework: true,
    },
    where,
    orderBy: {
      tanggal: "asc",
    },
  });

  const monthName = now.toLocaleString("en-US", { month: "long" });
  const resultData = [];
  const daysInMonth = lastDay.getDate();

  for (let d = 1; d <= daysInMonth; d++) {
    const currentDate = new Date(year, month, d);
    const dateStr = currentDate.toISOString().split("T")[0];

    const existing = data.find((item) => {
      const itemDate = new Date(item.tanggal).toISOString().split("T")[0];
      return itemDate === dateStr;
    });

    if (existing) {
      resultData.push({
        day: d,
        ok: existing._sum.qty_ok || 0,
        ng:
          (existing._sum.qty_ng_prev || 0) + (existing._sum.qty_ng_proses || 0),
        rework: existing._sum.qty_rework || 0,
        total:
          (existing._sum.qty_ok || 0) +
          (existing._sum.qty_ng_prev || 0) +
          (existing._sum.qty_ng_proses || 0) +
          (existing._sum.qty_rework || 0),
      });
    } else {
      resultData.push({
        day: d,
        ok: 0,
        ng: 0,
        rework: 0,
        total: 0,
      });
    }
  }

  return {
    month: monthName,
    year,
    data: resultData,
  };
};

/**
 * Get Yearly Production Trend (Monthly grouping)
 * GET /lrp-dashboard/trend-bulanan
 */
const getTrendBulanan = async (filter) => {
  const year = filter.year ? Number(filter.year) : new Date().getFullYear();

  const firstDay = new Date(year, 0, 1);
  const lastDay = new Date(year, 11, 31, 23, 59, 59, 999);

  const baseWhere = buildFilterWhereClause(filter);
  delete baseWhere.tanggal;

  const where = {
    ...baseWhere,
    created_at: {
      gte: firstDay,
      lte: lastDay,
    },
  };

  // Group by month using raw query or fetch and group in JS
  // Prisma groupBy doesnt support month extraction in MySQL directly easily without raw
  // We'll fetch all and group in JS for simplicity or use groupBy if we can rely on data
  const data = await prisma.laporanRealisasiProduksi.findMany({
    where,
    select: {
      qty_ok: true,
      qty_ng_prev: true,
      qty_ng_proses: true,
      qty_rework: true,
      tanggal: true,
    },
  });

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const resultData = months.map((month) => ({
    month,
    ok: 0,
    ng: 0,
    rework: 0,
    total: 0,
  }));

  data.forEach((item) => {
    const monthIndex = new Date(item.tanggal).getMonth();
    resultData[monthIndex].ok += item.qty_ok || 0;
    resultData[monthIndex].ng +=
      (item.qty_ng_prev || 0) + (item.qty_ng_proses || 0);
    resultData[monthIndex].rework += item.qty_rework || 0;
    resultData[monthIndex].total +=
      (item.qty_ok || 0) +
      (item.qty_ng_prev || 0) +
      (item.qty_ng_proses || 0) +
      (item.qty_rework || 0);
  });

  return {
    year,
    data: resultData,
  };
};

/**
 * Get OK vs NG comparison
 */
const getOkVsNg = async (filter) => {
  const where = buildFilterWhereClause(filter);

  const aggregate = await prisma.laporanRealisasiProduksi.aggregate({
    where,
    _sum: {
      qty_ok: true,
      qty_ng_prev: true,
      qty_ng_proses: true,
      qty_rework: true,
    },
  });

  const ok = aggregate._sum.qty_ok || 0;
  const ng =
    (aggregate._sum.qty_ng_prev || 0) + (aggregate._sum.qty_ng_proses || 0);
  const rework = aggregate._sum.qty_rework || 0;
  const total = ok + ng + rework;

  return {
    ok,
    ng,
    rework,
    total,
  };
};

/**
 * Get LRP List
 */
const getLrpList = async (filter, options) => {
  const where = buildFilterWhereClause(filter);
  const page = options.page || 1;
  const limit = options.limit || 10;
  const skip = (page - 1) * limit;

  const [total, data] = await Promise.all([
    prisma.laporanRealisasiProduksi.count({ where }),
    prisma.laporanRealisasiProduksi.findMany({
      where,
      include: { mesin: true, shift: true, operator: true, logs: true },
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
    }),
  ]);

  const transformedData = data.map((lrp) => {
    const totalMinutes = lrp.logs.reduce(
      (acc, log) => acc + log.durasi_menit,
      0,
    );
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);

    const { logs, ...rest } = lrp;
    return { ...rest, jam_kerja: `${hours}h ${minutes}m` };
  });

  return {
    data: transformedData,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get LRP Detail
 */
const getLrpDetail = async (id) => {
  const lrp = await prisma.laporanRealisasiProduksi.findUnique({
    where: { id },
    include: {
      mesin: true,
      shift: true,
      operator: true,
      logs: {
        orderBy: { waktu_start: "asc" },
      },
    },
  });

  if (!lrp) {
    throw new ApiError(httpStatus.NOT_FOUND, "LRP not found");
  }

  // Summary Waktu from logs
  const summary_waktu = {
    runtime: 0,
    breakdown: 0,
    plan_downtime: 0,
  };

  lrp.logs.forEach((log) => {
    if (log.kategori_downtime === "RUNTIME")
      summary_waktu.runtime += log.durasi_menit;
    else if (log.kategori_downtime === "BREAKDOWN")
      summary_waktu.breakdown += log.durasi_menit;
    else if (log.kategori_downtime === "PLAN_DOWNTIME")
      summary_waktu.plan_downtime += log.durasi_menit;
  });

  const { logs, ...header } = lrp;

  return {
    header,
    logs,
    summary_waktu,
  };
};

/**
 * Export LRP Dashboard data to Excel
 * Returns a Buffer containing the .xlsx file
 */
const exportData = async (filter) => {
  const where = buildFilterWhereClause(filter);

  // 1. Fetch Summary Data
  const summary = await getDashboardSummary(filter);

  // 2. Fetch Comparison Data
  const comparison = await getOkVsNg(filter);

  // 3. Fetch Detailed LRP List (All data for the filtered criteria)
  const lrpData = await prisma.laporanRealisasiProduksi.findMany({
    where,
    include: {
      mesin: true,
      shift: true,
      operator: true,
      logs: {
        select: { durasi_menit: true },
      },
    },
    orderBy: { created_at: "desc" },
  });

  // Transform LRP List for Sheet
  const sheetRows = lrpData.map((lrp) => {
    const totalMinutes = lrp.logs.reduce(
      (acc, log) => acc + log.durasi_menit,
      0,
    );
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    const jamKerja = `${hours}h ${minutes}m`;

    return {
      Tanggal: new Date(lrp.tanggal).toISOString().split("T")[0],
      Shift: lrp.shift?.nama_shift || "-",
      Mesin: lrp.mesin?.nama_mesin || "-",
      "Part No": lrp.no_kanagata || "-",
      "Lot No": lrp.no_lot || "-",
      OK: lrp.qty_ok || 0,
      NG: (lrp.qty_ng_prev || 0) + (lrp.qty_ng_proses || 0),
      Rework: lrp.qty_rework || 0,
      Total: lrp.qty_total_prod || 0,
      "Jam Kerja": jamKerja,
      Status: lrp.status_lrp || "SUBMITTED",
    };
  });

  // Create Workbook
  const wb = xlsx.utils.book_new();

  // Summary Sheet
  const summaryData = [
    ["RINGKASAN DASHBOARD LRP"],
    [""],
    ["Total OK", summary.total_ok],
    ["Total NG", summary.total_ng],
    ["Total Rework", summary.total_rework],
    ["Total Quantity", summary.total_qty],
    ["Laporan Hari Ini", summary.laporan_hari_ini],
    [""],
    ["PERBANDINGAN OK vs NG vs REWORK"],
    ["OK", comparison.ok],
    ["NG", comparison.ng],
    ["Rework", comparison.rework],
    ["Total", comparison.total],
  ];
  const summarySheet = xlsx.utils.aoa_to_sheet(summaryData);
  xlsx.utils.book_append_sheet(wb, summarySheet, "Summary");

  // Detailed List Sheet
  const detailedSheet = xlsx.utils.json_to_sheet(sheetRows);

  // Set column widths for better design
  const wscols = [
    { wch: 15 }, // Tanggal
    { wch: 10 }, // Shift
    { wch: 15 }, // Mesin
    { wch: 20 }, // Part No
    { wch: 20 }, // Lot No
    { wch: 8 }, // OK
    { wch: 8 }, // NG
    { wch: 8 }, // Rework
    { wch: 8 }, // Total
    { wch: 12 }, // Jam Kerja
    { wch: 15 }, // Status
  ];
  detailedSheet["!cols"] = wscols;

  xlsx.utils.book_append_sheet(wb, detailedSheet, "Daftar LRP");

  // Generate buffer
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
};

export default {
  getDashboardSummary,
  getTrendBulananHarian,
  getTrendBulanan,
  getOkVsNg,
  getLrpList,
  getLrpDetail,
  exportData,
};
