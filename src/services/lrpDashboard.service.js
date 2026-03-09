import prisma from "../../prisma/index.js";
import { Prisma } from "@prisma/client";
import httpStatus from "http-status";
import xlsx from "xlsx-js-style";
import moment from "moment";
import ApiError from "../utils/ApiError.js";

/**
 * Helper untuk membangun kueri filter Prisma
 * Mendukung: Rentang Tanggal, Tanggal Tunggal, Mesin, Shift, dan Search
 */
const buildFilterWhereClause = (filter) => {
  const where = {};

  // 1. Logika Tanggal (Single Date or Range)
  if (filter.startDate && filter.endDate) {
    where.tanggal = {
      gte: moment.utc(filter.startDate).startOf("day").toDate(),
      lte: moment.utc(filter.endDate).endOf("day").toDate(),
    };
  } else if (filter.startDate) {
    where.tanggal = moment.utc(filter.startDate).startOf("day").toDate();
  } else if (filter.endDate) {
    where.tanggal = moment.utc(filter.endDate).endOf("day").toDate();
  }

  // 2. Filter ID (Foreign Keys)
  if (filter.fk_id_mesin) where.fk_id_mesin = Number(filter.fk_id_mesin);
  if (filter.fk_id_shift) where.fk_id_shift = Number(filter.fk_id_shift);

  // 3. Filter Relation (Jenis Pekerjaan & Produk)
  // Filter ini ada di model RencanaProduksi (fk_id_rph)
  if (filter.fk_id_jenis_pekerjaan || filter.fk_id_produk) {
    where.rencana_produksi = {};
    if (filter.fk_id_jenis_pekerjaan) {
      where.rencana_produksi.fk_id_jenis_pekerjaan = Number(
        filter.fk_id_jenis_pekerjaan,
      );
    }
    if (filter.fk_id_produk) {
      where.rencana_produksi.fk_id_produk = Number(filter.fk_id_produk);
    }
  }

  // 4. Filter Plant (via Operator relation)
  if (filter.plant && filter.plant !== "Semua Plant") {
    where.operator = {
      plant: filter.plant,
    };
  }

  // 5. Pencarian (Optional)
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
  where.status_lrp = "VERIFIED";

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
  const refDate = filter.startDate ? moment.utc(filter.startDate) : moment();
  const year = refDate.year();
  const month = refDate.month(); // 0-indexed

  const firstDay = moment.utc([year, month, 1]).startOf("day");
  const lastDay = moment.utc(firstDay).endOf("month");

  // Build base filter and override date to full month range
  const baseWhere = buildFilterWhereClause(filter);
  baseWhere.status_lrp = "VERIFIED";
  baseWhere.tanggal = {
    gte: firstDay.toDate(),
    lte: lastDay.toDate(),
  };

  const data = await prisma.laporanRealisasiProduksi.groupBy({
    by: ["tanggal"],
    _sum: {
      qty_ok: true,
      qty_ng_prev: true,
      qty_ng_proses: true,
      qty_rework: true,
    },
    where: baseWhere,
    orderBy: { tanggal: "asc" },
  });

  const monthName = firstDay.format("MMMM");
  const resultData = [];
  const daysInMonth = lastDay.date();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = moment.utc([year, month, d]).format("YYYY-MM-DD");

    const existing = data.find((item) => {
      const itemDate = moment.utc(item.tanggal).format("YYYY-MM-DD");
      return itemDate === dateStr;
    });

    resultData.push({
      day: d,
      ok: existing?._sum.qty_ok || 0,
      ng:
        (existing?._sum.qty_ng_prev || 0) + (existing?._sum.qty_ng_proses || 0),
      rework: existing?._sum.qty_rework || 0,
      total:
        (existing?._sum.qty_ok || 0) +
        (existing?._sum.qty_ng_prev || 0) +
        (existing?._sum.qty_ng_proses || 0) +
        (existing?._sum.qty_rework || 0),
    });
  }

  return { month: monthName, year, data: resultData };
};

/**
 * Get Yearly Production Trend (Monthly grouping)
 * GET /lrp-dashboard/trend-bulanan
 *
 * Optimized: aggregasi dilakukan di MySQL dengan GROUP BY MONTH(tanggal),
 * bukan di JS. Menghindari membaca seluruh row 1 tahun ke memory Node.js.
 */
const getTrendBulanan = async (filter) => {
  const refDate = filter.startDate ? moment.utc(filter.startDate) : moment();

  // [Fix #4] Guard: moment.year() mengembalikan NaN jika input tidak valid
  if (!refDate.isValid()) {
    throw new ApiError(httpStatus.BAD_REQUEST, "startDate tidak valid");
  }

  const year = refDate.year();

  // --- Build WHERE conditions as parameterized Prisma.sql fragments ---
  // [Fix #1] Pakai BETWEEN literal agar MySQL bisa index range scan.
  // YEAR(col) = X membungkus kolom dalam fungsi → MySQL tidak bisa pakai index.
  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;

  const conditions = [
    Prisma.sql`lrp.tanggal BETWEEN ${startOfYear} AND ${endOfYear}`,
    Prisma.sql`lrp.status_lrp = 'VERIFIED'`,
  ];

  if (filter.fk_id_mesin) {
    conditions.push(
      Prisma.sql`lrp.fk_id_mesin = ${Number(filter.fk_id_mesin)}`,
    );
  }
  if (filter.fk_id_shift) {
    conditions.push(
      Prisma.sql`lrp.fk_id_shift = ${Number(filter.fk_id_shift)}`,
    );
  }

  // --- Build JOIN clauses for relation-based filters ---
  // [Fix #3] Set-based addJoin() mencegah duplikat JOIN jika ada filter gabungan
  // yang keduanya butuh tabel yang sama di masa depan.
  const joins = [];
  const joinSet = new Set();
  const addJoin = (key, sqlFragment) => {
    if (!joinSet.has(key)) {
      joinSet.add(key);
      joins.push(sqlFragment);
    }
  };

  // Filter by plant (via operator/user relation)
  if (filter.plant && filter.plant !== "Semua Plant") {
    addJoin("user", Prisma.sql`JOIN \`user\` u ON u.id = lrp.fk_id_operator`);
    conditions.push(Prisma.sql`u.plant = ${filter.plant}`);
  }

  // Filter by jenis_pekerjaan / produk (via rencana_produksi relation)
  if (filter.fk_id_jenis_pekerjaan || filter.fk_id_produk) {
    addJoin(
      "rph",
      Prisma.sql`JOIN rencana_produksi rph ON rph.id = lrp.fk_id_rph`,
    );
    if (filter.fk_id_jenis_pekerjaan) {
      conditions.push(
        Prisma.sql`rph.fk_id_jenis_pekerjaan = ${Number(
          filter.fk_id_jenis_pekerjaan,
        )}`,
      );
    }
    if (filter.fk_id_produk) {
      conditions.push(
        Prisma.sql`rph.fk_id_produk = ${Number(filter.fk_id_produk)}`,
      );
    }
  }

  // [Fix #5] reduce() lebih tepat daripada Prisma.join() untuk SQL clause fragments.
  // Prisma.join() dirancang untuk daftar nilai (IN (...)), bukan SQL statements.
  const joinClause = joins.reduce(
    (acc, j) => Prisma.sql`${acc} ${j}`,
    Prisma.empty,
  );
  const whereClause = Prisma.join(conditions, " AND ");

  // --- Single aggregated query — MySQL does all the work ---
  const rawData = await prisma.$queryRaw(Prisma.sql`
    SELECT
      MONTH(lrp.tanggal)           AS bulan,
      SUM(lrp.qty_ok)              AS total_ok,
      SUM(lrp.qty_ng_prev)         AS total_ng_prev,
      SUM(lrp.qty_ng_proses)       AS total_ng_proses,
      SUM(lrp.qty_rework)          AS total_rework
    FROM laporan_realisasi_produksi lrp
    ${joinClause}
    WHERE ${whereClause}
    GROUP BY MONTH(lrp.tanggal)
    ORDER BY MONTH(lrp.tanggal) ASC
  `);

  // --- Map hasil ke array 12 bulan (bulan yang tidak ada data → 0) ---
  // Catatan: MySQL SUM() mengembalikan Decimal/BigInt, wajib dikonversi ke Number
  const MONTHS = [
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

  const resultData = MONTHS.map((monthName, idx) => {
    const monthNum = idx + 1;
    const row = rawData.find((r) => Number(r.bulan) === monthNum);

    const ok = Number(row?.total_ok ?? 0);
    const ng =
      Number(row?.total_ng_prev ?? 0) + Number(row?.total_ng_proses ?? 0);
    const rework = Number(row?.total_rework ?? 0);

    return { month: monthName, ok, ng, rework, total: ok + ng + rework };
  });

  return { year, data: resultData };
};

const getLrpList = async (filter) => {
  const where = buildFilterWhereClause(filter);

  const data = await prisma.laporanRealisasiProduksi.findMany({
    where,
    include: {
      mesin: true,
      shift: true,
      operator: true,
      rencana_produksi: { include: { jenis_pekerjaan: true } },
    },
    orderBy: { created_at: "desc" },
  });

  const transformedData = data.map((lrp) => {
    const totalMinutes = lrp.loading_time || 0;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    const counterEnd = lrp.counter_end;
    const counterEndFormatted =
      counterEnd != null
        ? `${Math.floor(counterEnd / 60)} h ${counterEnd % 60} m`
        : "-";
    return {
      id: lrp.id,
      tanggal: lrp.tanggal,
      nama_shift: lrp.shift?.nama_shift || "-",
      nama_mesin: lrp.mesin?.nama_mesin || "-",
      no_kanagata: lrp.no_kanagata,
      no_lot: lrp.no_lot,
      qty_ok: lrp.qty_ok,
      qty_ng: (lrp.qty_ng_prev || 0) + (lrp.qty_ng_proses || 0),
      qty_rework: lrp.qty_rework,
      qty_total_prod: lrp.qty_total_prod,
      jenis_pekerjaan:
        lrp.rencana_produksi?.jenis_pekerjaan?.nama_pekerjaan || "-",
      counter_end_formatted: counterEndFormatted,
      jam_kerja: `${hours}h ${minutes}m`,
      status_lrp: lrp.status_lrp,
    };
  });

  return transformedData;
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
    },
  });

  if (!lrp) {
    throw new ApiError(httpStatus.NOT_FOUND, "LRP not found");
  }

  // Summary Waktu (Placeholder since logs are removed)
  const summary_waktu = {
    runtime: lrp.loading_time || 0,
    breakdown: 0,
    plan_downtime: 0,
  };

  return {
    header: lrp,
    logs: [],
    summary_waktu,
  };
};

/**
 * Export LRP Dashboard data to Excel (Multi-Sheet, Styled)
 * Sheets: 1) Ringkasan, 2) Trend Harian, 3) Trend Bulanan, 4) Daftar LRP
 */
const exportData = async (filter) => {
  // ── Fetch all data in parallel ─────────────────────────────────────────────
  const [summary, trendHarian, trendBulanan, trendPress, lrpRaw] =
    await Promise.all([
      getDashboardSummary(filter),
      getTrendBulananHarian(filter),
      getTrendBulanan(filter),
      getTrendPress(filter),
      prisma.laporanRealisasiProduksi.findMany({
        where: buildFilterWhereClause(filter),
        include: {
          mesin: true,
          shift: true,
          operator: true,
          rencana_produksi: { include: { jenis_pekerjaan: true } },
        },
        orderBy: { tanggal: "desc" },
      }),
    ]);

  // ── Color / Style palette ──────────────────────────────────────────────────
  const C = {
    navyBg: "1E3A5F",
    blueBg: "2E6DA4",
    lblBg: "D6EAF8",
    white: "FFFFFF",
    altRow: "EBF5FB",
    okGreen: "1A7A42",
    ngRed: "C0392B",
    rwOrang: "D35400",
    totDark: "2C3E50",
    border: "BDC3C7",
  };

  const brdr = () => ({
    top: { style: "thin", color: { rgb: C.border } },
    bottom: { style: "thin", color: { rgb: C.border } },
    left: { style: "thin", color: { rgb: C.border } },
    right: { style: "thin", color: { rgb: C.border } },
  });

  const hdr = (bg = C.navyBg) => ({
    font: { bold: true, color: { rgb: C.white }, sz: 12 },
    fill: { fgColor: { rgb: bg } },
    alignment: { horizontal: "center", vertical: "center" },
    border: brdr(),
  });

  const subHdr = () => ({
    font: { bold: true, color: { rgb: C.white }, sz: 11 },
    fill: { fgColor: { rgb: C.blueBg } },
    alignment: { horizontal: "center", vertical: "center" },
    border: brdr(),
  });

  const lbl = () => ({
    font: { bold: true, sz: 11 },
    fill: { fgColor: { rgb: C.lblBg } },
    alignment: { horizontal: "left", vertical: "center" },
    border: brdr(),
  });

  const valS = (color) => ({
    font: { bold: true, color: { rgb: color }, sz: 12 },
    alignment: { horizontal: "center", vertical: "center" },
    border: brdr(),
  });

  const cellS = (isAlt, align = "center") => ({
    font: { sz: 10 },
    fill: { fgColor: { rgb: isAlt ? C.altRow : C.white } },
    alignment: { horizontal: align, vertical: "center" },
    border: brdr(),
  });

  const numS = (color, isAlt) => ({
    font: { bold: true, color: { rgb: color }, sz: 10 },
    fill: { fgColor: { rgb: isAlt ? C.altRow : C.white } },
    alignment: { horizontal: "center", vertical: "center" },
    border: brdr(),
  });

  const COLS = "ABCDEFGHIJKLM".split("");
  const wb = xlsx.utils.book_new();
  // Format tanggal dengan WIB (UTC+7)
  const startMoment = filter.startDate
    ? moment(filter.startDate).utcOffset(7)
    : moment().utcOffset(7);
  const endMoment = filter.endDate
    ? moment(filter.endDate).utcOffset(7)
    : moment(startMoment);

  const startStr = startMoment.format("DD/MM/YYYY");
  const endStr = endMoment.format("DD/MM/YYYY");
  const rangeStr = startStr === endStr ? startStr : `${startStr} - ${endStr}`;

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 1 — RINGKASAN
  // ═══════════════════════════════════════════════════════════════════════════
  const ws1 = {};
  ws1["A1"] = {
    v: `LAPORAN REALISASI PRODUKSI - RINGKASAN (${rangeStr})`,
    s: hdr(),
  };
  ws1["B1"] = { v: "", s: hdr() };

  const summaryRows = [
    ["Total OK", summary.total_ok, C.okGreen],
    ["Total NG", summary.total_ng, C.ngRed],
    ["Total Rework", summary.total_rework, C.rwOrang],
    ["Total Produksi", summary.total_qty, C.totDark],
    ["Laporan Hari Ini", summary.laporan_hari_ini, C.blueBg],
  ];
  summaryRows.forEach(([label, val, color], i) => {
    const row = i + 3;
    ws1[`A${row}`] = { v: label, s: lbl() };
    ws1[`B${row}`] = { v: val, s: valS(color) };
  });
  ws1["!ref"] = "A1:B7";
  ws1["!cols"] = [{ wch: 24 }, { wch: 16 }];
  ws1["!rows"] = [{ hpt: 28 }];
  ws1["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  xlsx.utils.book_append_sheet(wb, ws1, "📊 Ringkasan");

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 2 — TREND HARIAN
  // ═══════════════════════════════════════════════════════════════════════════
  const ws2 = {};
  const thTitle = `TREND PRODUKSI HARIAN - ${trendHarian.month.toUpperCase()} ${
    trendHarian.year
  }`;
  ["A", "B", "C", "D", "E"].forEach((c) => {
    ws2[`${c}1`] = { v: c === "A" ? thTitle : "", s: hdr() };
  });

  ["Tanggal", "OK", "NG", "Rework", "Total"].forEach((h, i) => {
    ws2[`${COLS[i]}2`] = { v: h, s: subHdr() };
  });

  trendHarian.data.forEach((d, i) => {
    const row = i + 3;
    const isAlt = i % 2 === 0;
    const ds = `${String(d.day).padStart(2, "0")} ${trendHarian.month} ${
      trendHarian.year
    }`;
    ws2[`A${row}`] = { v: ds, s: cellS(isAlt) };
    ws2[`B${row}`] = { v: d.ok, s: numS(C.okGreen, isAlt) };
    ws2[`C${row}`] = { v: d.ng, s: numS(C.ngRed, isAlt) };
    ws2[`D${row}`] = { v: d.rework, s: numS(C.rwOrang, isAlt) };
    ws2[`E${row}`] = { v: d.total, s: numS(C.totDark, isAlt) };
  });
  ws2["!ref"] = `A1:E${trendHarian.data.length + 2}`;
  ws2["!cols"] = [
    { wch: 22 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];
  ws2["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  xlsx.utils.book_append_sheet(wb, ws2, "📅 Trend Harian");

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 3 — TREND BULANAN
  // ═══════════════════════════════════════════════════════════════════════════
  const ws3 = {};
  const tbTitle = `TREND PRODUKSI BULANAN - TAHUN ${trendBulanan.year}`;
  ["A", "B", "C", "D", "E"].forEach((c) => {
    ws3[`${c}1`] = { v: c === "A" ? tbTitle : "", s: hdr() };
  });

  ["Bulan", "OK", "NG", "Rework", "Total"].forEach((h, i) => {
    ws3[`${COLS[i]}2`] = { v: h, s: subHdr() };
  });

  trendBulanan.data.forEach((d, i) => {
    const row = i + 3;
    const isAlt = i % 2 === 0;
    ws3[`A${row}`] = { v: d.month, s: cellS(isAlt, "left") };
    ws3[`B${row}`] = { v: d.ok, s: numS(C.okGreen, isAlt) };
    ws3[`C${row}`] = { v: d.ng, s: numS(C.ngRed, isAlt) };
    ws3[`D${row}`] = { v: d.rework, s: numS(C.rwOrang, isAlt) };
    ws3[`E${row}`] = { v: d.total, s: numS(C.totDark, isAlt) };
  });
  ws3["!ref"] = "A1:E14";
  ws3["!cols"] = [
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];
  ws3["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  xlsx.utils.book_append_sheet(wb, ws3, "📈 Trend Bulanan");

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 4 — DAFTAR LRP
  // ═══════════════════════════════════════════════════════════════════════════
  const ws4 = {};
  const lrpTitle = `DAFTAR LAPORAN REALISASI PRODUKSI & STATUS (${rangeStr})`;
  // 13 columns: A–M
  "ABCDEFGHIJKLMN".split("").forEach((c) => {
    ws4[`${c}1`] = { v: c === "A" ? lrpTitle : "", s: hdr() };
  });

  [
    "Tanggal",
    "Operator",
    "Shift",
    "Mesin",
    "Jenis Pekerjaan",
    "Part No",
    "Lot No",
    "OK",
    "NG",
    "Rework",
    "Total",
    "Counter pada Mesin",
    "Jam Kerja",
    "Status",
  ].forEach((h, i) => {
    ws4[`${COLS[i]}2`] = { v: h, s: subHdr() };
  });

  lrpRaw.forEach((lrp, i) => {
    const row = i + 3;
    const isAlt = i % 2 === 0;
    const tgl = lrp.tanggal
      ? moment(lrp.tanggal).utcOffset(7).format("DD/MM/YYYY")
      : "-";
    const ng = (lrp.qty_ng_prev || 0) + (lrp.qty_ng_proses || 0);
    const totalMins = lrp.loading_time || 0;
    const jamKerja = `${Math.floor(totalMins / 60)}h ${Math.round(
      totalMins % 60,
    )}m`;
    const ce = lrp.counter_end;
    const counterEndFmt =
      ce != null ? `${Math.floor(ce / 60)}h ${ce % 60}m` : "-";
    const jp = lrp.rencana_produksi?.jenis_pekerjaan?.nama_pekerjaan || "-";
    ws4[`A${row}`] = { v: tgl, s: cellS(isAlt) };
    ws4[`B${row}`] = { v: lrp.operator?.nama || "-", s: cellS(isAlt, "left") };
    ws4[`C${row}`] = { v: lrp.shift?.nama_shift || "-", s: cellS(isAlt) };
    ws4[`D${row}`] = { v: lrp.mesin?.nama_mesin || "-", s: cellS(isAlt) };
    ws4[`E${row}`] = { v: jp, s: cellS(isAlt) };
    ws4[`F${row}`] = { v: lrp.no_kanagata || "-", s: cellS(isAlt) };
    ws4[`G${row}`] = { v: lrp.no_lot || "-", s: cellS(isAlt) };
    ws4[`H${row}`] = { v: lrp.qty_ok || 0, s: numS(C.okGreen, isAlt) };
    ws4[`I${row}`] = { v: ng, s: numS(C.ngRed, isAlt) };
    ws4[`J${row}`] = { v: lrp.qty_rework || 0, s: numS(C.rwOrang, isAlt) };
    ws4[`K${row}`] = { v: lrp.qty_total_prod || 0, s: numS(C.totDark, isAlt) };
    ws4[`L${row}`] = { v: counterEndFmt, s: cellS(isAlt) };
    ws4[`M${row}`] = { v: jamKerja, s: cellS(isAlt) };
    ws4[`N${row}`] = { v: lrp.status_lrp || "SUBMITTED", s: cellS(isAlt) };
  });
  ws4["!ref"] = `A1:N${lrpRaw.length + 2}`;
  ws4["!cols"] = [
    { wch: 13 }, // Tanggal
    { wch: 22 }, // Operator
    { wch: 10 }, // Shift
    { wch: 14 }, // Mesin
    { wch: 16 }, // Jenis Pekerjaan
    { wch: 16 }, // Part No
    { wch: 12 }, // Lot No
    { wch: 8 }, // OK
    { wch: 8 }, // NG
    { wch: 8 }, // Rework
    { wch: 8 }, // Total
    { wch: 16 }, // Counter End
    { wch: 10 }, // Jam Kerja
    { wch: 12 }, // Status
  ];
  ws4["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 13 } }];
  xlsx.utils.book_append_sheet(wb, ws4, "📋 Daftar LRP");

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEET 5 — TREND PRESS
  // ═══════════════════════════════════════════════════════════════════════════
  const ws5 = {};
  const tpTitle = `TREND PRODUKSI PRESS`;
  ["A", "B", "C", "D", "E"].forEach((c) => {
    ws5[`${c}1`] = { v: c === "A" ? tpTitle : "", s: hdr() };
  });

  ["Tanggal", "OK", "NG", "Rework", "Total"].forEach((h, i) => {
    ws5[`${COLS[i]}2`] = { v: h, s: subHdr() };
  });

  trendPress.data.forEach((d, i) => {
    const row = i + 3;
    const isAlt = i % 2 === 0;
    const ds = d.date;
    ws5[`A${row}`] = { v: ds, s: cellS(isAlt) };
    ws5[`B${row}`] = { v: d.ok, s: numS(C.okGreen, isAlt) };
    ws5[`C${row}`] = { v: d.ng, s: numS(C.ngRed, isAlt) };
    ws5[`D${row}`] = { v: d.rework, s: numS(C.rwOrang, isAlt) };
    ws5[`E${row}`] = { v: d.total, s: numS(C.totDark, isAlt) };
  });
  ws5["!ref"] = `A1:E${trendPress.data.length + 2}`;
  ws5["!cols"] = [
    { wch: 22 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ];
  ws5["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  xlsx.utils.book_append_sheet(wb, ws5, "🚜 Trend Press");

  // ── Generate buffer ────────────────────────────────────────────────────────
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
};

/**
 * Get Production Trend for Press Machine Category
 */
const getTrendPress = async (filter) => {
  let start, end;

  // Determine range logic based on priority: Range > Single Side > Default Today
  if (filter.startDate && filter.endDate) {
    start = moment.utc(filter.startDate).startOf("day");
    end = moment.utc(filter.endDate).endOf("day");
  } else if (filter.startDate) {
    start = moment.utc(filter.startDate).startOf("day");
    end = moment.utc(filter.startDate).endOf("day");
  } else if (filter.endDate) {
    start = moment.utc(filter.endDate).startOf("day");
    end = moment.utc(filter.endDate).endOf("day");
  } else {
    // Default today WIB (Asia/Jakarta)
    start = moment().startOf("day");
    end = moment().endOf("day");
  }

  // Clone filter to avoid side effects and force our calculated range
  const innerFilter = { ...filter };
  delete innerFilter.startDate;
  delete innerFilter.endDate;

  const where = {
    ...buildFilterWhereClause(innerFilter),
    status_lrp: "VERIFIED",
    mesin: { kategori: "PRESS" },
    tanggal: {
      gte: start.toDate(),
      lte: end.toDate(),
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
    orderBy: { tanggal: "asc" },
  });

  const resultData = [];
  const durationDays = end.diff(start, "days") + 1;

  for (let i = 0; i < durationDays; i++) {
    const current = moment(start).add(i, "days");
    const dateStr = current.format("YYYY-MM-DD");

    const existing = data.find((item) => {
      const itemDate = moment.utc(item.tanggal).format("YYYY-MM-DD");
      return itemDate === dateStr;
    });

    resultData.push({
      date: dateStr, // Returning full date for flexibility
      day: current.date(),
      ok: existing?._sum.qty_ok || 0,
      ng:
        (existing?._sum.qty_ng_prev || 0) + (existing?._sum.qty_ng_proses || 0),
      rework: existing?._sum.qty_rework || 0,
      total:
        (existing?._sum.qty_ok || 0) +
        (existing?._sum.qty_ng_prev || 0) +
        (existing?._sum.qty_ng_proses || 0) +
        (existing?._sum.qty_rework || 0),
    });
  }

  return {
    month: start.format("MMMM"),
    year: start.year(),
    data: resultData,
  };
};

/**
 * Get Unified Dashboard Data
 * Combines Summary, Trends, and LRP List
 */
const getUnifiedDashboardData = async (filter) => {
  const [
    summary,
    trend_bulanan_harian,
    trend_bulanan,
    lrp_list,
    trend_produksi_press,
  ] = await Promise.all([
    getDashboardSummary(filter),
    getTrendBulananHarian(filter),
    getTrendBulanan(filter),
    getLrpList(filter),
    getTrendPress(filter),
  ]);

  return {
    summary,
    trend_bulanan_harian,
    trend_bulanan,
    lrp_list,
    trend_produksi_press,
  };
};

export default {
  getDashboardSummary,
  getTrendBulananHarian,
  getTrendBulanan,
  getLrpList,
  getLrpDetail,
  getUnifiedDashboardData,
  exportData,
};
