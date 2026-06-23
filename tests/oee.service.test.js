import { jest } from "@jest/globals";
import moment from "moment";

// 1. Mocks
jest.unstable_mockModule("../src/utils/dateWIB.js", () => ({
  nowWIB: jest.fn(() => new Date("2026-06-23T10:00:00Z")), // Default "now" for tests
}));

jest.unstable_mockModule("../src/config/socket.js", () => ({
  emitOeeUpdate: jest.fn(),
}));

const mockPrisma = {
  andonDowntimeShift: { findMany: jest.fn() },
  laporanRealisasiProduksi: { findMany: jest.fn() },
  attendance: { findMany: jest.fn() },
  oee: { upsert: jest.fn() },
  rencanaProduksi: { findMany: jest.fn() },
};

jest.unstable_mockModule("../prisma/index.js", () => ({
  default: mockPrisma,
}));

const { default: oeeService } = await import("../src/services/oee.service.js");
const { nowWIB } = await import("../src/utils/dateWIB.js");
const { emitOeeUpdate } = await import("../src/config/socket.js");

describe("OEE Service - Daily Aggregate Refactor Suite", () => {
  const mesinId = 1;
  const targetDateStr = "2026-06-23";
  const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks to prevent crashes and ensure consistency
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([]);
    mockPrisma.attendance.findMany.mockResolvedValue([]);
  });

  // --- HAPPY PATHS ---

  test("1. Single product production", async () => {
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      {
        qtyOk: 100,
        qtyTotalProd: 100,
        cycleTime: 1.0,
        updatedAt: new Date("2026-06-23T12:00:00Z"),
        rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") },
      },
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([
      { jamTap: new Date("2026-06-23T07:00:00Z") }
    ]);

    // expectedTime = 100 * 1.0 = 100
    // totalTime = 12:00 - 07:00 = 300 mins
    // loadingTime = 300, runtime = 300
    // Availability = 100%, Performance = (100/300) * 100 = 33.3%, Quality = 100%
    // OEE = 33.3%

    await oeeService.recalculateByMesin(mesinId, targetDate);

    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          oeeScore: 33.3,
          performance: 33.3,
        }),
      })
    );
  });

  test("2. Multi product production", async () => {
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      {
        qtyOk: 100, qtyTotalProd: 100, cycleTime: 0.5,
        updatedAt: new Date("2026-06-23T09:00:00Z"),
        rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") },
      },
      {
        qtyOk: 50, qtyTotalProd: 50, cycleTime: 2.0,
        updatedAt: new Date("2026-06-23T12:00:00Z"),
        rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T09:00:00Z") },
      },
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);

    // expectedTime = (100 * 0.5) + (50 * 2.0) = 50 + 100 = 150
    // totalOutput = 150
    // weightedCycleTime = 150 / 150 = 1.0
    // totalTime = 12:00 - 07:00 = 300 mins
    // Performance = (150 / 300) * 100 = 50%

    await oeeService.recalculateByMesin(mesinId, targetDate);

    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          performance: 50,
          idealCycleTime: 1.0,
        }),
      })
    );
  });

  test("3. Daily aggregation across multiple shifts", async () => {
    // Similar to #2 but emphasizing different RPHs
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { id: 1, qtyOk: 100, qtyTotalProd: 100, cycleTime: 1.0, updatedAt: new Date("2026-06-23T14:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } },
      { id: 2, qtyOk: 100, qtyTotalProd: 100, cycleTime: 1.0, updatedAt: new Date("2026-06-23T22:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T15:00:00Z") } },
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);

    await oeeService.recalculateByMesin(mesinId, targetDate);

    // Verify only one upsert call (Prisma upsert handles the "only one row" requirement via unique constraint)
    expect(mockPrisma.oee.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ totalOutput: 200 })
      })
    );
  });

  test("4. Mid-shift urgent RPH switch", async () => {
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { id: 1, qtyOk: 50, qtyTotalProd: 50, cycleTime: 1.0, updatedAt: new Date("2026-06-23T09:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } },
      { id: 2, qtyOk: 50, qtyTotalProd: 50, cycleTime: 1.0, updatedAt: new Date("2026-06-23T11:00:00Z"), rencanaProduksi: { status: "ACTIVE", startTime: new Date("2026-06-23T09:05:00Z") } },
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);
    
    // now is 10:00 (from mock)
    // lastActivity = now = 10:00
    // totalTime = 10:00 - 07:00 = 180 mins
    // expTime = 100
    // Performance = (100 / 180) * 100 = 55.6%

    await oeeService.recalculateByMesin(mesinId, targetDate);

    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ performance: 55.6 }) })
    );
  });

  // --- REALTIME CASES ---

  test("5. Active RPH (uses nowWIB)", async () => {
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 10, qtyTotalProd: 10, cycleTime: 1.0, updatedAt: new Date("2026-06-23T08:00:00Z"), rencanaProduksi: { status: "ACTIVE", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);
    
    // totalTime = 10:00 - 07:00 = 180 mins
    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ loadingTime: 180 }) }));
  });

  test("6. Closed production day (uses latest LRP updatedAt)", async () => {
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 10, qtyTotalProd: 10, cycleTime: 1.0, updatedAt: new Date("2026-06-23T09:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);
    
    // totalTime = 09:00 - 07:00 = 120 mins
    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ loadingTime: 120 }) }));
  });

  // --- DOWNTIME CASES ---

  test("7. Planned downtime only (affects loadingTime)", async () => {
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([
      { durasiMenit: 30, andonEvent: { masterMasalahAndon: { kategori: "PLAN_DOWNTIME" } } }
    ]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 60, qtyTotalProd: 60, cycleTime: 1.0, updatedAt: new Date("2026-06-23T09:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);

    // totalTime = 120
    // loadingTime = 120 - 30 = 90
    // expTime = 60
    // Performance = (60 / 90) * 100 = 66.7%

    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ loadingTime: 90, performance: 66.7 }) }));
  });

  test("8. Unplanned downtime only (affects availability)", async () => {
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([
      { durasiMenit: 30, andonEvent: { masterMasalahAndon: { kategori: "MAINTENANCE" } } }
    ]); // Unplanned
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 60, qtyTotalProd: 60, cycleTime: 1.0, updatedAt: new Date("2026-06-23T09:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);

    // totalTime = 120, loadingTime = 120
    // runtime = 120 - 30 = 90
    // Availability = (90 / 120) * 100 = 75%
    // Performance = (60 / 90) * 100 = 66.7%

    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ availability: 75, performance: 66.7 }) }));
  });

  test("9. Mixed downtime", async () => {
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([
      { durasiMenit: 20, andonEvent: { masterMasalahAndon: { kategori: "PLAN_DOWNTIME" } } },
      { durasiMenit: 10, andonEvent: { masterMasalahAndon: { kategori: "QUALITY" } } }
    ]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 90, qtyTotalProd: 90, cycleTime: 1.0, updatedAt: new Date("2026-06-23T09:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);

    // totalTime = 120
    // loadingTime = 120 - 20 = 100
    // runtime = 100 - 10 = 90
    // expTime = 90
    // Avail = (90/100)*100 = 90%, Perf = (90/90)*100 = 100%

    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ availability: 90, performance: 100 }) }));
  });

  // --- EDGE CASES ---

  test("10. runtime = 0 (performance must be 0)", async () => {
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([
      { durasiMenit: 100, andonEvent: { masterMasalahAndon: { kategori: "MAINTENANCE" } } }
    ]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
       { qtyOk: 10, qtyTotalProd: 10, cycleTime: 1.0, updatedAt: new Date("2026-06-23T08:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]); // loading = 60, unplanned = 100 => runtime = 0
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);

    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ performance: 0, availability: 0 }) }));
  });

  test("11. loadingTime <= 0 (availability must be 0)", async () => {
    mockPrisma.andonDowntimeShift.findMany.mockResolvedValue([
      { durasiMenit: 100, andonEvent: { masterMasalahAndon: { kategori: "PLAN_DOWNTIME" } } }
    ]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
       { qtyOk: 10, qtyTotalProd: 10, cycleTime: 1.0, updatedAt: new Date("2026-06-23T08:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]); // totalTime = 60, planned = 100 => loadingTime = 0
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);

    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ availability: 0, loadingTime: 0 }) }));
  });

  test("12. totalOutput = 0 (quality must be 0)", async () => {
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 0, qtyTotalProd: 0, cycleTime: 1.0, updatedAt: new Date("2026-06-23T09:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);
    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ quality: 0 }) }));
  });

  test("13. cycleTime null (should be treated as 0)", async () => {
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 10, qtyTotalProd: 10, cycleTime: null, updatedAt: new Date("2026-06-23T09:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);
    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ performance: 0 }) }));
  });

  test("14. cycleTime negative (safety check, should ignore)", async () => {
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 10, qtyTotalProd: 10, cycleTime: -5.0, updatedAt: new Date("2026-06-23T09:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);
    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ performance: 0 }) }));
  });

  test("15. NaN production values (safety check)", async () => {
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: NaN, qtyTotalProd: "abc", cycleTime: undefined, updatedAt: new Date("2026-06-23T09:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);
    await oeeService.recalculateByMesin(mesinId, targetDate);
    // Should safely finish with 0s
    expect(mockPrisma.oee.upsert).toHaveBeenCalled();
  });

  test("16. missing attendance but valid RPH startTime (fallback use case)", async () => {
    mockPrisma.attendance.findMany.mockResolvedValue([]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 10, qtyTotalProd: 10, cycleTime: 1.0, updatedAt: new Date("2026-06-23T08:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    // Uses RPH startTime 07:00 => loading 60 mins
    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ loadingTime: 60 }) }));
  });

  test("17. no attendance and no RPH startTime (skip execution safely)", async () => {
    mockPrisma.attendance.findMany.mockResolvedValue([]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 10, qtyTotalProd: 10, cycleTime: 1.0, updatedAt: new Date("2026-06-23T08:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: null } }
    ]);
    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).not.toHaveBeenCalled();
  });

  test("18. Midnight spanning production", async () => {
    // Production starts at 23:30 (Day 23)
    // Finished at 02:00 (Day 24)
    // We are running recalculate for targetDate Day 23
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T23:30:00Z") }]);
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { 
        qtyOk: 100, 
        qtyTotalProd: 100, 
        cycleTime: 1.0, 
        updatedAt: new Date("2026-06-24T02:00:00Z"), 
        rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T23:30:00Z") } 
      }
    ]);
    
    // firstActivity (Day 23 23:30)
    // lastActivity (Day 24 02:00)
    // diff = 150 minutes
    // expectedTime = 100 * 1.0 = 100
    // Perf = (100 / 150) * 100 = 66.7%

    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          performance: 66.7,
        }),
      })
    );
  });

  // --- PERFORMANCE CASES ---

  test("19. Overperformance >100% (Not capped)", async () => {
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue([
      { qtyOk: 200, qtyTotalProd: 200, cycleTime: 1.0, updatedAt: new Date("2026-06-23T08:00:00Z"), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } }
    ]);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);
    
    // expTime = 200
    // totalTime = 60 mins
    // Perf = (200 / 60) * 100 = 333.3%

    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ performance: 333.3 }) }));
  });

  test("20. Large scale stress test (100 LRP records)", async () => {
    const lrpData = [];
    for (let i = 0; i < 100; i++) {
       lrpData.push({ id: i, qtyOk: 10, qtyTotalProd: 10, cycleTime: 0.1, updatedAt: new Date(`2026-06-23T10:00:00Z`), rencanaProduksi: { status: "CLOSED", startTime: new Date("2026-06-23T07:00:00Z") } });
    }
    mockPrisma.laporanRealisasiProduksi.findMany.mockResolvedValue(lrpData);
    mockPrisma.attendance.findMany.mockResolvedValue([{ jamTap: new Date("2026-06-23T07:00:00Z") }]);

    // totalOutput = 1000, expTime = 1000 * 0.1 = 100 mins
    await oeeService.recalculateByMesin(mesinId, targetDate);
    expect(mockPrisma.oee.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ totalOutput: 1000 }) }));
  });
});
