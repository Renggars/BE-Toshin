import catchAsync from "../utils/catchAsync.js";
import poinService from "../services/poin.service.js";
import moment from "moment";
import XlsxStyle from "xlsx-js-style";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
  fill: { fgColor: { rgb: "1F4E79" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: {
    top: { style: "thin", color: { rgb: "000000" } },
    bottom: { style: "thin", color: { rgb: "000000" } },
    left: { style: "thin", color: { rgb: "000000" } },
    right: { style: "thin", color: { rgb: "000000" } },
  },
};

const SECTION_TITLE_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
  fill: { fgColor: { rgb: "2E75B6" } },
  alignment: { horizontal: "left", vertical: "center" },
};

const CELL_STYLE_EVEN = {
  fill: { fgColor: { rgb: "FFFFFF" } },
  alignment: { vertical: "center" },
  border: {
    top: { style: "hair", color: { rgb: "DDDDDD" } },
    bottom: { style: "hair", color: { rgb: "DDDDDD" } },
    left: { style: "thin", color: { rgb: "CCCCCC" } },
    right: { style: "thin", color: { rgb: "CCCCCC" } },
  },
};

const CELL_STYLE_ODD = {
  fill: { fgColor: { rgb: "DEEAF1" } },
  alignment: { vertical: "center" },
  border: {
    top: { style: "hair", color: { rgb: "DDDDDD" } },
    bottom: { style: "hair", color: { rgb: "DDDDDD" } },
    left: { style: "thin", color: { rgb: "CCCCCC" } },
    right: { style: "thin", color: { rgb: "CCCCCC" } },
  },
};

const STATUS_COLOR = {
  AMAN: "2D7D46",
  TEGURAN: "E6A817",
  SP1: "C05621",
  SP2: "C0392B",
  SP3: "891A1A",
};

const makeCell = (value, style = {}) => ({
  v: value ?? "-",
  s: style,
});

const makeHeaderCell = (value) => ({ v: value, s: HEADER_STYLE });

const sendWorkbook = (res, wb, filename) => {
  const buf = XlsxStyle.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(buf);
};

// ─── Export Riwayat Pelanggaran ────────────────────────────────────────────────

const exportHRPoinExcel = catchAsync(async (req, res) => {
  const filter = {
    month: req.query.month,
    role: req.query.role,
    plant: req.query.plant,
    divisiId: req.query.divisiId,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  };

  const result = await poinService.getHRHistory(filter, { page: 1, limit: 10000 });
  const data = result.data;

  // Sheet setup
  const ws = {};
  const cols = [5, 14, 12, 22, 18, 8, 14, 14, 26, 15, 14, 12, 35];

  // Title rows
  const periodLabel = filter.month
    ? moment(filter.month, "YYYY-MM").format("MMMM YYYY")
    : filter.startDate
    ? `${filter.startDate} s/d ${filter.endDate || "sekarang"}`
    : "Seluruh Waktu";

  ws["A1"] = { v: "LAPORAN RIWAYAT PELANGGARAN SISTEM POIN DISIPLIN", s: { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" } } };
  ws["A2"] = { v: `Periode: ${periodLabel} | Role: ${filter.role || "Semua"} | Plant: ${filter.plant || "Semua"}`, s: { alignment: { horizontal: "center" } } };
  ws["A3"] = { v: `Digenerate: ${moment().format("DD/MM/YYYY HH:mm")} WIB`, s: { alignment: { horizontal: "center" } } };
  ws["A4"] = { v: "" };

  // Headers (row 5)
  const headers = ["No", "Tanggal", "No Reg", "Nama Karyawan", "Divisi", "Plant", "Role", "Shift", "Tipe", "Kategori", "Poin", "Status", "Keterangan"];
  headers.forEach((h, i) => {
    ws[XlsxStyle.utils.encode_cell({ r: 4, c: i })] = makeHeaderCell(h);
  });

  // Data rows start at row 6 (index 5)
  data.forEach((item, rowIdx) => {
    const style = rowIdx % 2 === 0 ? CELL_STYLE_EVEN : CELL_STYLE_ODD;
    const statusStyle = { ...style, font: { bold: true, color: { rgb: STATUS_COLOR[item.statusLevel] || "000000" } } };
    const poinStyle = {
      ...style,
      font: { bold: true, color: { rgb: item.poinBerubah < 0 ? "C0392B" : "2D7D46" } },
      alignment: { horizontal: "center", vertical: "center" },
    };

    const row = [
      makeCell(rowIdx + 1, { ...style, alignment: { horizontal: "center", vertical: "center" } }),
      makeCell(moment(item.tanggal).format("DD/MM/YYYY"), style),
      makeCell(item.noReg, style),
      makeCell(item.nama, style),
      makeCell(item.divisi, style),
      makeCell(item.plant, { ...style, alignment: { horizontal: "center", vertical: "center" } }),
      makeCell(item.role, style),
      makeCell(item.shift, style),
      makeCell(item.tipe, style),
      makeCell(item.kategori, style),
      makeCell(item.poinBerubah, poinStyle),
      makeCell(item.statusLevel, statusStyle),
      makeCell(item.keterangan, style),
    ];

    row.forEach((cell, colIdx) => {
      ws[XlsxStyle.utils.encode_cell({ r: 5 + rowIdx, c: colIdx })] = cell;
    });
  });

  // Merge title rows
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 12 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 12 } },
  ];

  ws["!ref"] = XlsxStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 5 + data.length, c: 12 } });
  ws["!cols"] = cols.map((w) => ({ wch: w }));
  ws["!rows"] = [{ hpx: 30 }, { hpx: 18 }, { hpx: 18 }, { hpx: 8 }, { hpx: 22 }];

  const wb = XlsxStyle.utils.book_new();
  XlsxStyle.utils.book_append_sheet(wb, ws, "Riwayat Pelanggaran");

  sendWorkbook(res, wb, `laporan_poin_${moment().format("YYYYMMDD_HHmm")}.xlsx`);
});

// ─── Export Ranking Karyawan ───────────────────────────────────────────────────

const exportHRRankingsExcel = catchAsync(async (req, res) => {
  const { month, role, plant, type = "worst" } = req.query;

  const result = await poinService.getHRRankings(month, role, plant, type, 1, 1000);
  const periodLabel = month ? moment(month, "YYYY-MM").format("MMMM YYYY") : "Seluruh Waktu";
  const isWorst = type !== "best";

  const sectionTitle = isWorst
    ? "WORST EMPLOYEES - Poin Terendah (Perlu Perhatian)"
    : "BEST EMPLOYEES - Poin Tertinggi (Berprestasi)";
  const sectionColor = isWorst ? "C0392B" : "1E8449";

  const rankCols = [5, 12, 22, 18, 8, 12, 12, 22];
  const rankHeaders = ["No", "No Reg", "Nama Karyawan", "Divisi", "Plant", "Poin", "Status", "Total Pelanggaran"];

  const ws = {};

  // Title rows
  ws["A1"] = { v: `LAPORAN RANKING KARYAWAN - ${isWorst ? "WORST EMPLOYEES" : "BEST EMPLOYEES"}`, s: { font: { bold: true, sz: 14 }, alignment: { horizontal: "center" } } };
  ws["A2"] = { v: `Periode: ${periodLabel} | Role: ${role || "PRODUKSI"} | Plant: ${plant || "Semua"}`, s: { alignment: { horizontal: "center" } } };
  ws["A3"] = { v: `Digenerate: ${moment().format("DD/MM/YYYY HH:mm")} WIB`, s: { alignment: { horizontal: "center" } } };

  // Section title row
  ws[XlsxStyle.utils.encode_cell({ r: 4, c: 0 })] = {
    v: sectionTitle,
    s: { ...SECTION_TITLE_STYLE, fill: { fgColor: { rgb: sectionColor } } },
  };

  // Headers
  rankHeaders.forEach((h, i) => {
    ws[XlsxStyle.utils.encode_cell({ r: 5, c: i })] = makeHeaderCell(h);
  });

  // Data rows
  result.data.forEach((u, idx) => {
    const style = idx % 2 === 0 ? CELL_STYLE_EVEN : CELL_STYLE_ODD;
    const statusStyle = { ...style, font: { bold: true, color: { rgb: STATUS_COLOR[u.status] || "000000" } } };

    const row = [
      makeCell(idx + 1, { ...style, alignment: { horizontal: "center", vertical: "center" } }),
      makeCell(u.noReg, style),
      makeCell(u.nama, style),
      makeCell(u.divisi, style),
      makeCell(u.plant, { ...style, alignment: { horizontal: "center", vertical: "center" } }),
      makeCell(u.poin, { ...style, alignment: { horizontal: "center", vertical: "center" }, font: { bold: true } }),
      makeCell(u.status, statusStyle),
      makeCell(u.totalPelanggaran, { ...style, alignment: { horizontal: "center", vertical: "center" } }),
    ];

    row.forEach((cell, colIdx) => {
      ws[XlsxStyle.utils.encode_cell({ r: 6 + idx, c: colIdx })] = cell;
    });
  });

  const lastRow = 6 + result.data.length;

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 7 } },
  ];

  ws["!ref"] = XlsxStyle.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: 7 } });
  ws["!cols"] = rankCols.map((w) => ({ wch: w }));
  ws["!rows"] = [{ hpx: 30 }, { hpx: 18 }, { hpx: 18 }, {}, { hpx: 22 }, { hpx: 22 }];

  const wb = XlsxStyle.utils.book_new();
  XlsxStyle.utils.book_append_sheet(wb, ws, isWorst ? "Worst Employees" : "Best Employees");

  const typeLabel = isWorst ? "worst" : "best";
  sendWorkbook(res, wb, `laporan_ranking_${typeLabel}_${moment().format("YYYYMMDD_HHmm")}.xlsx`);
});

export default {
  exportHRPoinExcel,
  exportHRRankingsExcel,
};
