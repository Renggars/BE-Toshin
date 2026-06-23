import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";
import moment from "moment-timezone";
import { oeeQueue } from "../queues/oeeQueue.js";
import {
  emitAndonUpdate,
  emitAndonDashboardUpdate,
  emitAndonCreated,
  emitAndonResolved,
  emitAndonRepairStarted,
  emitAndonSummaryUpdated,
  emitAndonMetricChanged,
  emitAndonTriggered,
  emitAndonStarted,
  emitAndonResolvedWS,
  emitAndonCancelled,
} from "../config/socket.js";

import {
  businessTaskCreatedTotal,
  businessTaskResolvedTotal,
} from "../config/businessMetrics.js";

import logger from "../config/logger.js";

import notificationService from "./notification.service.js";
import tcpService from "./tcp.service.js";

const getHardwareDivisi = (divisiStr) => {
  if (!divisiStr) return "MTC";
  const upper = divisiStr.toUpperCase();

  if (upper.includes("DIE_MAINT") || upper.includes("DIE")) return "DM";
  if (upper.includes("PRODUKSI") || upper.includes("PROD")) return "PRD";
  if (upper.includes("QUALITY") || upper.includes("QC")) return "QC";
  if (upper.includes("MAINTENANCE") || upper.includes("MTC")) return "MTC";

  return "MTC";
};

const TZ = "Asia/Jakarta";
import { nowWIB } from "../utils/dateWIB.js";

/**
 * Helper: enqueue OEE recalculation job dengan dedup + delay.
 * Sama persis dengan helper di lrp.service.js — non-blocking.
 */
const enqueueOeeRecalc = async (mesinId, tanggal) => {
  if (!oeeQueue) return;
  const tanggalStr = moment(tanggal).tz(TZ).format("YYYY-MM-DD");
  await oeeQueue.add(
    "oee-recalc",
    { mesinId, tanggal: tanggalStr },
    { jobId: `oee-${mesinId}-${tanggalStr}`, delay: 3000 },
  );
};

/**
 * Helper: Determine Shift & Operational Date based on time (WIB)
 */
const getShiftInfo = async (time) => {
  const shifts = await prisma.shift.findMany();
  const timeMoment = moment(time).tz(TZ);
  const dateStr = timeMoment.format("YYYY-MM-DD");
  // 3. Find segments
  for (const shift of shifts) {
    const shiftStart = moment.tz(
      `${dateStr} ${shift.jamMasuk}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );
    let shiftEnd = moment.tz(
      `${dateStr} ${shift.jamKeluar}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );
    let opDate = dateStr;

    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, "day");
      // If we are in the "morning" part of this overnight shift
      if (timeMoment.isBefore(shiftStart)) {
        shiftStart.subtract(1, "day");
        shiftEnd.subtract(1, "day");
        opDate = moment.tz(dateStr, TZ).subtract(1, "day").format("YYYY-MM-DD");
      }
    }

    if (timeMoment.isBetween(shiftStart, shiftEnd, null, "[]")) {
      return { shiftId: shift.id, operationalDate: opDate };
    }
  }

  // Fallback if no specific shift matches (maintenance period, etc.)
  return { shiftId: null, operationalDate: dateStr };
};

/**
 * Helper: Fetch History Data (Centralized)
 */
const fetchHistoryHelper = async (where, page, limit) => {
  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const [dataRaw, totalItems] = await Promise.all([
    prisma.andonEvent.findMany({
      where,
      select: {
        id: true,
        waktuTrigger: true,
        waktuRepair: true,
        waktuResolved: true,
        durasiDowntime: true,
        catatan: true,
        status: true,
        plant: true,
        responStatus: true,
        mesin: { select: { namaMesin: true } },
        masterMasalahAndon: {
          select: {
            namaMasalah: true,
            kategori: true,
            waktuPerbaikanMenit: true,
          },
        },
        operator: { select: { nama: true } },
        resolvedBy: { select: { nama: true } },
        shift: { select: { namaShift: true } },
      },
      orderBy: { waktuTrigger: "desc" },
      skip,
      take,
    }),
    prisma.andonEvent.count({ where }),
  ]);

  const mappedData = dataRaw.map((e) => ({
    id: e.id,
    tanggal: e.waktuTrigger,
    mesin: e.mesin?.namaMesin,
    plant: e.plant,
    shift: e.shift?.namaShift,
    masalah: e.masterMasalahAndon?.namaMasalah,
    kategori: e.masterMasalahAndon?.kategori,
    operator: e.operator?.nama || "-",
    resolver: e.resolvedBy?.nama || "-",
    downtime:
      e.waktuResolved && e.waktuRepair
        ? Number(
          (
            (new Date(e.waktuResolved) - new Date(e.waktuRepair)) /
            60000
          ).toFixed(2),
        )
        : e.durasiDowntime || 0,
    real_downtime:
      e.waktuResolved && e.waktuTrigger
        ? Number(
          (
            (new Date(e.waktuResolved) - new Date(e.waktuTrigger)) /
            60000
          ).toFixed(2),
        )
        : e.totalDurationMenit || 0,
    status: e.status,
    estimasi_menit: e.masterMasalahAndon?.waktuPerbaikanMenit || 0,
    waktu_resolved: e.waktuResolved,
    respon_status: e.responStatus,
    catatan: e.catatan || "-",
  }));

  return {
    data: mappedData,
    meta: {
      totalItems,
      totalPages: Math.ceil(totalItems / take),
      currentPage: Number(page),
    },
  };
};

/**
 * Helper: Calculate Andon Summary for WebSocket Events
 */
const calculateAndonSummary = async (plantFilter = {}) => {
  const { operationalDate: opDateStr } = await getShiftInfo(new Date());
  const operationalDate = new Date(`${opDateStr}T00:00:00.000Z`);

  const [resolvedToday, aggTotal, totalActiveRepair, totalActiveCall] =
    await Promise.all([
      prisma.andonEvent.count({
        where: {
          status: "RESOLVED",
          tanggal: operationalDate,
          kategori: { not: "PLAN_DOWNTIME" },
          ...plantFilter,
        },
      }),
      prisma.andonEvent.aggregate({
        _sum: { totalDurationMenit: true },
        where: {
          status: "RESOLVED",
          tanggal: operationalDate,
          kategori: { not: "PLAN_DOWNTIME" },
          ...plantFilter,
        },
      }),
      // Total Active Repair (IN_REPAIR)
      prisma.andonEvent.count({
        where: {
          status: "IN_REPAIR",
          kategori: { not: "PLAN_DOWNTIME" },
          ...plantFilter,
        },
      }),
      // Total Active Call (WAITING)
      prisma.andonCall.count({
        where: {
          status: "WAITING",
          ...plantFilter,
        },
      }),
    ]);

  return {
    resolvedToday,
    totalDowntime: Number((aggTotal._sum.totalDurationMenit || 0).toFixed(2)),
    totalActiveCall,
    totalActiveRepair,
  };
};

/**
 * Smart Trigger: Auto-detect Operator & Shift from RPH
 */
const triggerAndon = async (payload) => {
  console.log("[Andon] Trigger Payload:", JSON.stringify(payload, null, 2));
  const {
    mesinId: rawMesinId,
    masalahId: masalahId,
    operatorId: manualOperator,
    nextRphId: manualNextRphId, // Explicitly passed from frontend
  } = payload;
  const mesinId = Number(rawMesinId);
  const currentTime = nowWIB();

  // 1. Fetch Masalah to check for RPH behavior early
  const masalah = await prisma.masterMasalahAndon.findUnique({
    where: { id: masalahId },
  });
  if (!masalah)
    throw new ApiError(httpStatus.NOT_FOUND, "Masalah tidak ditemukan");

  const RPH_SWITCH_NAMES = [
    "Pindah Mesin",
    "Pindah Produk",
    "Pindah Jenis Pekerjaan",
  ];
  const isRphSwitch = RPH_SWITCH_NAMES.includes(masalah.namaMasalah);
  
  // 1.5 NEW: Idempotency check (prevent double trigger within 3s)
  const recentEvent = await prisma.andonEvent.findFirst({
    where: {
      mesinId,
      masalahId,
      waktuTrigger: {
        gte: new Date(currentTime.getTime() - 3000), // 3s cooldown
      },
    },
  });

  if (recentEvent) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `Aktivitas "${masalah.namaMasalah}" sudah dikirim. Tunggu beberapa saat.`
    );
  }

  // 2. Check for existing active andon
  const activeEvent = await prisma.andonEvent.findFirst({
    where: { mesinId, status: "ACTIVE" },
    include: { masterMasalahAndon: true },
  });

  if (activeEvent) {
    const isActiveReport =
      activeEvent.masterMasalahAndon?.namaMasalah === "Ngisi Laporan";

    // If it's a switch, we ONLY allow if current active is "Ngisi Laporan" (Back-to-Back)
    // If it's NOT a switch, we never allow new andon if one is already active
    if (!isRphSwitch || !isActiveReport) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Masih ada Andon ACTIVE (${activeEvent.masterMasalahAndon?.namaMasalah}) di mesin ini`,
      );
    }
  }

  // 3. Get Shift Info & Operational Date
  const { shiftId, operationalDate: opDateStr } = await getShiftInfo(
    currentTime,
  );
  const operationalDate = new Date(`${opDateStr}T00:00:00.000Z`);

  // 2. Fetch RPH Candidates for this machine on this operational date
  const rphCandidates = await prisma.rencanaProduksi.findMany({
    where: {
      mesinId,
      tanggal: operationalDate,
    },
    include: { shift: true },
  });

  let detectedOperator = manualOperator || null;
  let detectedShift = shiftId;

  // 3. Find Exact Match (Machine + Shift + Date)
  const exactMatch = rphCandidates.find((r) => r.shiftId === shiftId);
  if (exactMatch) {
    detectedOperator = exactMatch.userId;
  }
  // 4. Fallback: If no exact shift match, but there are RPHs today (Smart Detect)
  else if (!detectedOperator && rphCandidates.length > 0) {
    // Pick the first available assignment for this machine today
    detectedOperator = rphCandidates[0].userId;
    // If we didn't have a shiftId yet, take it from RPH
    if (!detectedShift) detectedShift = rphCandidates[0].shiftId;
  }

  // 5. Final Fallback: detectedShift is already set from getShiftInfo(currentTime)
  // which handles any time of day, even if not an exact RPH match.

  // Get Plant from Operator if possible
  let plantName = null;
  if (detectedOperator) {
    const op = await prisma.user.findUnique({
      where: { id: detectedOperator },
      select: { plant: true },
    });
    plantName = op?.plant;
  }

  // Flow Checklist: only PLAN_DOWNTIME can bypass Call phase
  if (masalah.kategori !== "PLAN_DOWNTIME") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Kategori ${masalah.kategori} harus melalui flow Call (POST /andon/call) terlebih dahulu`,
    );
  }

  let newEvent;
  let activeRphId = null;
  let openedRphId = null;

  // Find the current active RPH on this machine for THIS operator
  const currentActiveRph = await prisma.rencanaProduksi.findFirst({
    where: { 
      mesinId, 
      status: "ACTIVE",
      userId: detectedOperator || undefined,
    },
    orderBy: { startTime: "desc" },
  });

  if (isRphSwitch) {
    // 7. Handle RPH Switch (Audit Proposal: Don't close/open yet, just identify)
    // Jika tidak ada active RPH, kita masih bisa switch kalau targetnya jelas (manualNextRphId)
    if (!currentActiveRph && !manualNextRphId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Gagal trigger switch: Tidak ada RPH ACTIVE dan target RPH tidak ditentukan."
      );
    }

    let nextPlannedRph = null;
    if (manualNextRphId) {
      nextPlannedRph = await prisma.rencanaProduksi.findUnique({
        where: { id: Number(manualNextRphId) },
        include: { shift: true }
      });

      // Validation PATCH #3/2: Rigorous nextRph check
      if (!nextPlannedRph || (nextPlannedRph.status !== "PLANNED" && nextPlannedRph.status !== "ACTIVE")) {
        throw new ApiError(httpStatus.BAD_REQUEST, "RPH berikutnya tidak valid atau statusnya tidak sesuai (PLANNED/ACTIVE).");
      }
      if (currentActiveRph && nextPlannedRph.userId !== currentActiveRph.userId) {
        throw new ApiError(httpStatus.BAD_REQUEST, "RPH berikutnya milik operator yang berbeda dengan operator aktif saat ini.");
      }
      if (!currentActiveRph && nextPlannedRph.userId !== detectedOperator) {
        throw new ApiError(httpStatus.BAD_REQUEST, "RPH berikutnya milik operator yang berbeda dengan Anda.");
      }
      if (moment(nextPlannedRph.tanggal).format("YYYY-MM-DD") !== opDateStr) {
        throw new ApiError(httpStatus.BAD_REQUEST, "RPH berikutnya harus pada tanggal operasional yang sama.");
      }
      // Fallback: Temukan RPH berikutnya yang statusnya PLANNED atau ACTIVE 
      nextPlannedRph = await prisma.rencanaProduksi.findFirst({
        where: { 
          mesinId, 
          status: { in: ["PLANNED", "ACTIVE"] }, 
          tanggal: operationalDate,
          userId: detectedOperator || undefined,
          id: { not: currentActiveRph?.id || 0 }, // Hindari switch ke dirinya sendiri
        },
        orderBy: { id: "asc" },
      });

      // Jika masih tidak ketemu, dan currentActiveRph ada, gunakan currentActiveRph 
      // (asumsi: ini adalah RPH yang baru saja di-aktifkan otomatis oleh LRP submit)
      if (!nextPlannedRph && currentActiveRph) {
        nextPlannedRph = currentActiveRph;
      }
    }

    if (!nextPlannedRph) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Tidak ada RPH berikutnya (PLANNED/ACTIVE) untuk dialihkan",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Logic Audit: RPH stays ACTIVE during switch. Status updates moved to resolveAndon.
      activeRphId = currentActiveRph?.id || null;
      openedRphId = nextPlannedRph.id;

       // 🔍 NEW: Auto-Resolve "Ngisi Laporan" if still active
      let reportAndon = await tx.andonEvent.findFirst({
        where: {
          mesinId,
          status: { in: ["ACTIVE", "IN_REPAIR"] },
          masterMasalahAndon: { namaMasalah: "Ngisi Laporan" },
        },
        include: { masterMasalahAndon: true }, // Required for standardMinutes calculation
        orderBy: { waktuTrigger: "desc" },
      });

      if (reportAndon) {
        const waktuTrigger = new Date(reportAndon.waktuTrigger);
        const diffMs = currentTime - waktuTrigger;
        const duration = Number((diffMs / 60000).toFixed(2));

        const standardMinutes = reportAndon.masterMasalahAndon?.waktuPerbaikanMenit || 0;
        const lateMinutes = Number(Math.max(0, duration - standardMinutes).toFixed(2));
        const isLate = lateMinutes > 0;
        const responStatus = isLate ? "OVER_TIME" : "ON_TIME";

        const resolved = await tx.andonEvent.updateMany({
          where: {
            id: reportAndon.id,
            status: { in: ["ACTIVE", "IN_REPAIR"] },
          },
          data: {
            status: "RESOLVED",
            waktuResolved: currentTime,
            totalDurationMenit: duration,
            durasiDowntime: duration,
            lateMenit: lateMinutes,
            isLate: isLate,
            responStatus: responStatus,
            resolvedById: reportAndon.operatorId,
            catatan: "Auto-resolved by RPH switch",
            rphId: activeRphId || reportAndon.rphId,
          },
        });

        if (resolved.count === 0) {
          // Siapa cepat dia dapat, jika sudah di-resolve proses lain (e.g. double trigger),
          // maka kita set reportAndon ke null agar tidak kirim websocket ganda.
          reportAndon = null;
        }
      }

      businessTaskCreatedTotal.inc({ type: "andon_event" });
      return {
        newEvent: await tx.andonEvent.create({
          data: {
            mesinId,
            masalahId: masalahId,
            operatorId: detectedOperator,
            shiftId: detectedShift,
            tanggal: operationalDate,
            plant: plantName,
            kategori: masalah.kategori,
            status: "ACTIVE",
            waktuTrigger: currentTime,
            rphId: openedRphId, // Link downtime to NEW RPH (target)
            rphClosedId: activeRphId,
            rphOpenedId: openedRphId,
          },
          include: { mesin: true, masterMasalahAndon: true, operator: true, shift: true },
        }),
        resolvedReportAndon: reportAndon
          ? await tx.andonEvent.findUnique({
            where: { id: reportAndon.id },
            include: {
              mesin: true,
              masterMasalahAndon: true,
              operator: true,
              shift: true,
            },
          })
          : null,
      };
    });

    newEvent = result.newEvent;

    // Emit WebSocket for auto-resolved "Ngisi Laporan" Andon
    if (result.resolvedReportAndon) {
      const e = result.resolvedReportAndon;
      emitAndonResolved({
        andonId: e.id,
        tanggal: e.waktuTrigger,
        mesin: e.mesin?.namaMesin || "Unknown",
        plant: e.plant || "Unknown",
        shift: e.shift?.namaShift || "Unknown",
        masalah: e.masterMasalahAndon?.namaMasalah || "Unknown",
        kategori: e.masterMasalahAndon?.kategori || "UNKNOWN",
        operator: e.operator?.nama || "-",
        resolver: e.operator?.nama || "-",
        downtime: e.durasiDowntime,
        realDowntime: e.totalDurationMenit,
        status: "RESOLVED",
        estimasiMenit: e.masterMasalahAndon?.waktuPerbaikanMenit || 0,
        waktuResolved: e.waktuResolved,
        responStatus: e.responStatus, // Standardized: use responStatus instead of respStatus
      });
    }
  } else {
    // 8. Normal PLAN_DOWNTIME (Ngisi Laporan, Kamar Mandi, dll)
    // 🔥 FIX: If "Ngisi Laporan" triggered after RPH closed (by LRP), 
    // try to find the most recently closed RPH for this machine today.
    let effectiveRphId = currentActiveRph?.id || null;
    if (!effectiveRphId && masalah.namaMasalah === "Ngisi Laporan") {
      const lastClosedRph = await prisma.rencanaProduksi.findFirst({
        where: { mesinId, status: "CLOSED", tanggal: operationalDate },
        orderBy: { endTime: "desc" },
      });
      effectiveRphId = lastClosedRph?.id || null;
    }

    newEvent = await prisma.andonEvent.create({
      data: {
        mesinId,
        masalahId: masalahId,
        operatorId: detectedOperator,
        shiftId: detectedShift,
        tanggal: operationalDate,
        plant: plantName,
        kategori: masalah.kategori,
        status: "ACTIVE",
        waktuTrigger: currentTime,
        rphId: effectiveRphId,
        rphClosedId: effectiveRphId,
      },
      include: { mesin: true, masterMasalahAndon: true, operator: true, shift: true },
    });
    businessTaskCreatedTotal.inc({ type: "andon_event" });
  }

  // ✅ NEW: Emit specific WebSocket events following contract
  // Event 1: andon-created
  const machineId = newEvent.mesinId;
  const eventPayload = {
    andonId: newEvent.id,
    machineId: newEvent.mesinId,
    machineName: newEvent.mesin?.namaMesin || "Unknown",
    type: newEvent.masterMasalahAndon?.kategori || "UNKNOWN",
    problemName: newEvent.masterMasalahAndon?.namaMasalah || "Unknown Problem",
    startTime: newEvent.waktuTrigger,
    status: "ACTIVE",
    plant: newEvent.plant || "Unknown",
    operator: newEvent.operator?.nama || "-",
    shift: newEvent.shift?.namaShift || "-",
  };

  emitAndonCreated(eventPayload);
  emitAndonTriggered(machineId, eventPayload);

  // Event 2: andon-summary-updated
  const plantFilter = plantName ? { plant: plantName } : {};
  const summary = await calculateAndonSummary(plantFilter);
  emitAndonSummaryUpdated(summary);

  // Keep old events for backward compatibility
  emitAndonUpdate({
    type: "ANDON_TRIGGERED",
    data: newEvent,
  });

  emitAndonDashboardUpdate({
    type: "REFRESH_ANDON_DASHBOARD",
    mesinId: mesinId,
    plant: plantName,
    tanggal: opDateStr,
  });

  return newEvent;
};


/**
 * Start Repair Andon
 */
const startRepairAndon = async (id, data) => {
  const { userId, masalahId } = data;

  // 1. Check if ID refers to AndonCall
  const call = await prisma.andonCall.findUnique({
    where: { id },
    include: { mesin: true, operator: true, shift: true },
  });

  if (call) {
    if (call.status !== "WAITING") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Call sudah dikonversi atau dibatalkan",
      );
    }

    if (!masalahId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "masalahId wajib diisi untuk konversi call ke event",
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, nama: true },
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User tidak ditemukan");
    }

    const roleMapping = {
      MAINTENANCE: "MAINTENANCE",
      QUALITY: "QUALITY",
      DIE_MAINT: "DIE_MAINT",
      PRODUKSI: "OPERATOR",
    };

    const requiredRole = roleMapping[call.targetDivisi];

    // Authorize: Only matching role, or SUPERVISOR/ADMIN can start repair
    if (
      user.role !== requiredRole &&
      user.role !== "SUPERVISOR" &&
      user.role !== "ADMIN"
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `Hanya role ${requiredRole} yang boleh melakukan start repair untuk target divisi ${call.targetDivisi}`,
      );
    }

    const problem = await prisma.masterMasalahAndon.findUnique({
      where: { id: masalahId },
    });

    if (!problem) {
      throw new ApiError(httpStatus.NOT_FOUND, "Masalah tidak ditemukan");
    }

    // Role vs Problem Category validation
    // Example: If target was MAINTENANCE, but maintenance chooses a PROBLEM categorized as QUALITY?
    // We should probably trust the maintenance role to pick the right category now,
    // but the target_divisi was the one that responded.

    // Convert Call to Event in Transaction
    const newEvent = await prisma.$transaction(async (tx) => {
      // Find the current active RPH for this machine
      const activeRph = await tx.rencanaProduksi.findFirst({
        where: { mesinId: call.mesinId, status: "ACTIVE" },
      });

      const event = await tx.andonEvent.create({
        data: {
          mesinId: call.mesinId,
          operatorId: call.operatorId,
          shiftId: call.shiftId,
          rphId: activeRph?.id || null,
          masalahId: masalahId,
          kategori: problem.kategori,
          waktuTrigger: call.waktuCall, // waktuTrigger = call.waktuCall
          waktuRepair: nowWIB(), // waktuRepair = now() WIB
          status: "IN_REPAIR",
          tanggal: call.tanggal,
          plant: call.plant,
          resolvedById: userId,
        },
        include: { mesin: true, masterMasalahAndon: true, operator: true, shift: true },
      });

      await tx.andonCall.update({
        where: { id: call.id },
        data: {
          status: "CONVERTED",
          convertedEventId: event.id,
        },
      });

      return event;
    });

    const formattedEvent = {
      id: newEvent.id,
      tanggal: newEvent.waktuTrigger,
      mesin: newEvent.mesin?.namaMesin || "Unknown",
      plant: newEvent.plant || "Unknown",
      shift: newEvent.shift?.namaShift || "Unknown",
      masalah: newEvent.masterMasalahAndon?.namaMasalah || "Unknown",
      kategori: newEvent.masterMasalahAndon?.kategori || "UNKNOWN",
      operator: newEvent.operator?.nama || "-",
      resolver: user.nama || "-",
      downtime: 0,
      status: "IN_REPAIR",
      estimasi_menit: newEvent.masterMasalahAndon?.waktuPerbaikanMenit || 0,
      waktu_resolved: null,
      responStatus: null,
    };

    emitAndonRepairStarted(formattedEvent);
    emitAndonStarted(newEvent.mesinId, formattedEvent);
    const plantFilter = newEvent.plant ? { plant: newEvent.plant } : {};
    const summary = await calculateAndonSummary(plantFilter);
    emitAndonSummaryUpdated(summary);

    // Trigger Hardware TCP (Clear Call)
    const hwMesin = newEvent.mesin?.namaMesin || "UNKNOWN";
    const hwDivisi = getHardwareDivisi(call.targetDivisi);
    tcpService.broadcastCommand(`ANDON;${hwMesin};${hwDivisi};CLEAR`);

    // Send Notification to Supervisors (Target Division & Produksi)
    try {
      const supervisors = await prisma.user.findMany({
        where: {
          role: "SUPERVISOR",
          OR: [
            { divisi: { namaDivisi: { contains: call.targetDivisi.replace("_", " ") } } },
            { divisi: { namaDivisi: { contains: "PRODUKSI" } } }
          ]
        },
        select: { id: true },
      });

      if (supervisors.length > 0) {
        const waktuWIB = moment(newEvent.waktuRepair).tz(TZ).format("DD-MM-YYYY HH:mm:ss");
        const pesan =
          `🔧 Perbaikan Andon Dimulai!\n` +
          `Mesin: ${newEvent.mesin?.namaMesin || "Unknown"}\n` +
          `Teknisi: ${user.nama || "-"}\n` +
          `Waktu Mulai: ${waktuWIB} WIB\n` +
          `Kategori: ${problem.kategori}\n` +
          `Masalah: ${problem.namaMasalah}`;

        await notificationService.createBulkNotifications(
          supervisors.map((s) => s.id),
          "ANDON_CALL",
          `Andon Repair - ${newEvent.mesin?.namaMesin || "Unknown"}`,
          pesan,
        );
      }
    } catch (err) {
      console.error("Gagal membuat notifikasi start repair:", err);
    }

    return newEvent;
  }

  // 2. Fallback to existing AndonEvent logic (e.g. for PLAN_DOWNTIME)
  const event = await prisma.andonEvent.findUnique({
    where: { id },
    include: { masterMasalahAndon: true },
  });

  if (!event || event.status !== "ACTIVE") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Hanya Andon ACTIVE (atau WAITING Call) yang bisa mulai diperbaiki",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, nama: true },
  });

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "User tidak ditemukan");
  }

  const roleMapping = {
    MAINTENANCE: "MAINTENANCE",
    QUALITY: "QUALITY",
    DIE_MAINT: "DIE_MAINT",
    PRODUKSI: "OPERATOR",
    PLAN_DOWNTIME: "OPERATOR",
  };

  const requiredRole = roleMapping[event.masterMasalahAndon?.kategori || "PRODUKSI"];

  if (
    user.role !== requiredRole &&
    user.role !== "SUPERVISOR" &&
    user.role !== "ADMIN"
  ) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `Hanya divisi ${requiredRole} yang diizinkan melakukan pengerjaan untuk kategori ini.`,
    );
  }

  const problem = masalahId
    ? await prisma.masterMasalahAndon.findUnique({
      where: { id: masalahId },
    })
    : null;

  const updated = await prisma.andonEvent.update({
    where: { id },
    data: {
      status: "IN_REPAIR",
      waktuRepair: nowWIB(),
      resolvedById: userId,
      masalahId: masalahId || event.masalahId,
      kategori: problem ? problem.kategori : event.kategori,
    },
    include: { mesin: true, masterMasalahAndon: true, operator: true, shift: true },
  });

  const formattedEvent = {
    id: updated.id,
    tanggal: updated.waktuTrigger,
    mesin: updated.mesin?.namaMesin || "Unknown",
    plant: updated.plant || "Unknown",
    shift: updated.shift?.namaShift || "Unknown",
    masalah: updated.masterMasalahAndon?.namaMasalah || "Unknown",
    kategori: updated.masterMasalahAndon?.kategori || "UNKNOWN",
    operator: updated.operator?.nama || "-",
    resolver: user?.nama || "-",
    downtime: 0,
    status: "IN_REPAIR",
    estimasiMenit: updated.masterMasalahAndon?.waktuPerbaikanMenit || 0,
    waktuResolved: null,
    responStatus: null,
  };

  emitAndonRepairStarted(formattedEvent);
  emitAndonStarted(updated.mesinId, formattedEvent);
  const plantFilter = updated.plant ? { plant: updated.plant } : {};
  const summary = await calculateAndonSummary(plantFilter);
  emitAndonSummaryUpdated(summary);

  return updated;
};

/**
 * Resolve Andon
 */
const resolveAndon = async (id, data) => {
  const event = await prisma.andonEvent.findUnique({
    where: { id },
    include: { masterMasalahAndon: true },
  });

  if (!event || event.status === "RESOLVED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Andon invalid atau sudah RESOLVED",
    );
  }

  const isPlanDowntime = event.masterMasalahAndon?.kategori === "PLAN_DOWNTIME";

  // Authorization check
  const resolverId = data.resolvedBy || event.resolvedById;
  if (!resolverId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "User pelaksana resolve tidak diketahui");
  }

  const resolverUser = await prisma.user.findUnique({
    where: { id: resolverId },
    select: { id: true, role: true, nama: true },
  });

  if (!resolverUser) {
    throw new ApiError(httpStatus.NOT_FOUND, "User pelaksana resolve tidak ditemukan");
  }

  if (isPlanDowntime) {
    // RULE: For Plan Downtime, Resolver must be the SAME person as the one who started/triggered it.
    const originalOperatorId = event.resolvedById || event.operatorId;
    if (resolverUser.id !== originalOperatorId && resolverUser.role !== "SUPERVISOR" && resolverUser.role !== "ADMIN") {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `Untuk Plan Downtime, user yang melakukan resolve harus sama dengan yang memulai.`,
      );
    }
  } else {
    // RULE: For Breakdowns, Resolver can be different as long as they are in the same Division/Role.
    const roleMapping = {
      MAINTENANCE: "MAINTENANCE",
      QUALITY: "QUALITY",
      DIE_MAINT: "DIE_MAINT",
      PRODUKSI: "OPERATOR",
    };

    const requiredRole = roleMapping[event.masterMasalahAndon?.kategori || "OPERATOR"];

    if (
      resolverUser.role !== requiredRole &&
      resolverUser.role !== "SUPERVISOR" &&
      resolverUser.role !== "ADMIN"
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `Hanya divisi ${requiredRole} yang diizinkan melakukan resolve untuk kategori ini.`,
      );
    }
  }

  // State Machine Validation
  if (!isPlanDowntime && event.status !== "IN_REPAIR") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Perbaikan harus dimulai (IN_REPAIR) sebelum di-resolve",
    );
  }

  const resolvedAt = nowWIB();
  const triggerAt = new Date(event.waktuTrigger);
  const durationMs = resolvedAt - triggerAt;

  // Real decimal minutes (2 decimal precision)
  const realDurationMinutes = Number((durationMs / 60000).toFixed(2));

  const repairAt = event.waktuRepair
    ? new Date(event.waktuRepair)
    : triggerAt;
  const repairDurationMinutes = Number(
    ((resolvedAt - repairAt) / 60000).toFixed(2),
  );

  const standardMinutes = event.masterMasalahAndon?.waktuPerbaikanMenit || 0;
  const lateMinutes = Number(
    Math.max(0, repairDurationMinutes - standardMinutes).toFixed(2),
  );
  const isLate = lateMinutes > 0;
  const responStatus = isLate ? "OVER_TIME" : "ON_TIME";

  // No changes needed here as we moved logic up

  const RPH_SWITCH_NAMES = [
    "Pindah Mesin",
    "Pindah Produk",
    "Pindah Jenis Pekerjaan",
  ];
  const isRphSwitch =
    event.masterMasalahAndon?.kategori === "PLAN_DOWNTIME" &&
    RPH_SWITCH_NAMES.includes(event.masterMasalahAndon?.namaMasalah);

  // Use Transaction for Atomicity
  const [updatedEvent] = await prisma.$transaction(async (tx) => {
    // 🔒 Idempotency Audit PART 1: Handle RPH Transitions if Switch Andon
    if (isRphSwitch) {
      if (event.rphClosedId) {
        // Atomic Closure: Only close if still ACTIVE
        await tx.rencanaProduksi.updateMany({
          where: { id: event.rphClosedId, status: "ACTIVE" },
          data: { status: "CLOSED", endTime: resolvedAt }
        });
      }

      if (event.rphOpenedId) {
        // Atomic Activation: Only open if still PLANNED
        await tx.rencanaProduksi.updateMany({
          where: { id: event.rphOpenedId, status: "PLANNED" },
          data: { status: "ACTIVE", startTime: resolvedAt }
        });
      }
    }

    // 🔒 Idempotency Audit PART 2: Atomic resolve for AndonEvent
    const allowedStatuses = isPlanDowntime ? ["ACTIVE"] : ["IN_REPAIR"];
    const resolved = await tx.andonEvent.updateMany({
      where: {
        id,
        status: { in: allowedStatuses },
      },
      data: {
        status: "RESOLVED",
        waktuResolved: resolvedAt,
        durasiDowntime: repairDurationMinutes,
        totalDurationMenit: realDurationMinutes,
        lateMenit: lateMinutes,
        isLate: isLate,
        resolvedById: resolverId,
        catatan: data.catatan || null,
        responStatus: responStatus,
        masalahId: data.masalahId || event.masalahId,
        kategori: data.masalahId
          ? (
            await tx.masterMasalahAndon.findUnique({
              where: { id: data.masalahId },
            })
          )?.kategori
          : event.kategori,
      },
    });

    if (resolved.count === 0) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Andon sudah di-resolve oleh proses lain"
      );
    }

    const updated = await tx.andonEvent.findUnique({
      where: { id },
      include: { mesin: true, masterMasalahAndon: true, operator: true, shift: true },
    });
    businessTaskResolvedTotal.inc({ type: "andon_event" });

    const splitPromises = await generateSplitDowntimePromises(
      event,
      resolvedAt,
    );
    for (const p of splitPromises) {
      const existing = await tx.andonDowntimeShift.findFirst({
        where: {
          andonEventId: event.id,
          shiftId: p.data.shiftId,
        }
      });
      if (!existing) {
        await tx.andonDowntimeShift.create({ data: p.data });
      }
    }

    return [updated];
  });

  // 🔄 Multi-Machine OEE Recalc (Old and New)
  const machinesToRecalc = new Set([event.mesinId]);
  if (isRphSwitch && event.rphOpenedId) {
    const openedRph = await prisma.rencanaProduksi.findUnique({
      where: { id: event.rphOpenedId },
      select: { mesinId: true }
    });
    if (openedRph) machinesToRecalc.add(openedRph.mesinId);
  }

  await Promise.all(
    Array.from(machinesToRecalc).map((mId) => enqueueOeeRecalc(mId, event.tanggal))
  );

  emitAndonResolved({
    andonId: updatedEvent.id,
    tanggal: updatedEvent.waktuTrigger,
    mesin: updatedEvent.mesin?.namaMesin || "Unknown",
    plant: updatedEvent.plant || "Unknown",
    shift: updatedEvent.shift?.namaShift || "Unknown",
    masalah: updatedEvent.masterMasalahAndon?.namaMasalah || "Unknown",
    kategori: updatedEvent.masterMasalahAndon?.kategori || "UNKNOWN",
    operator: updatedEvent.operator?.nama || "-",
    resolver: resolverUser?.nama || "-",
    downtime: repairDurationMinutes,
    realDowntime: realDurationMinutes,
    status: "RESOLVED",
    estimasiMenit: updatedEvent.masterMasalahAndon?.waktuPerbaikanMenit || 0,
    waktuResolved: resolvedAt,
    responStatus: responStatus,
  });

  emitAndonResolvedWS(event.mesinId, {
    andonId: updatedEvent.id,
    status: "RESOLVED",
    mesinId: event.mesinId,
  });

  const plantFilter = event.plant ? { plant: event.plant } : {};
  const summary = await calculateAndonSummary(plantFilter);
  emitAndonSummaryUpdated(summary);
  emitAndonMetricChanged({ metric: "avg_downtime", scope: "today" });

  emitAndonUpdate({
    type: "ANDON_RESOLVED",
    data: { id, status: "RESOLVED", responStatus },
  });

  emitAndonDashboardUpdate({
    type: "REFRESH_ANDON_DASHBOARD",
    mesinId: event.mesinId,
    plant: event.plant,
    tanggal: moment(event.tanggal).format("YYYY-MM-DD"),
  });

  //tambahan untuk kirim notifikasi resolve ke supervisor divisi produksi
  const supervisors = await prisma.user.findMany({
    where: {
      role: "SUPERVISOR",
      divisi: { namaDivisi: { contains: "PRODUKSI" } },
    },
    select: { id: true },
  });

  if (supervisors.length > 0) {
    await notificationService.createBulkNotifications(
      supervisors.map((s) => s.id),
      "ANDON_RESOLVED",
      "Andon Telah Diselesaikan",
      `Andon di mesin ${updatedEvent.mesin?.namaMesin || "Unknown"
      } telah diselesaikan. Durasi downtime: ${repairDurationMinutes} menit (Total: ${realDurationMinutes} menit)`,
      JSON.stringify({
        andonId: id,
        mesin: updatedEvent.mesin?.namaMesin,
        durasi: repairDurationMinutes,
        realDurasi: realDurationMinutes,
      }),
    );
  }

  const waitTime = event.waktuRepair
    ? Number(
      (
        (new Date(event.waktuRepair) - new Date(event.waktuTrigger)) /
        60000
      ).toFixed(2),
    )
    : 0;

  return {
    andonEvent: updatedEvent,
    durasiDowntime: repairDurationMinutes,
    realDowntime: realDurationMinutes,
    waktuTungguMaintenance: waitTime,
    affectedShift: await prisma.andonDowntimeShift.findMany({
      where: { andonEventId: id },
    }),
  };
};

/**
 * Helper: Generate promises for splitting downtime
 */
const generateSplitDowntimePromises = async (event, resolvedAt) => {
  const triggerTime = moment(event.waktuTrigger).tz(TZ);
  const resolveTime = moment(resolvedAt).tz(TZ);
  const totalDurationMs = moment(resolveTime).diff(triggerTime);
  const totalDurationMenit = Number((totalDurationMs / 60000).toFixed(2));
  const dataList = [];

  // 1. Determine target RPH and Shift
  let rphId = event.rphOpenedId || event.rphClosedId || event.rphId;
  if (!rphId) {
    const activeRph = await prisma.rencanaProduksi.findFirst({
      where: { mesinId: event.mesinId, status: "ACTIVE" },
    });
    rphId = activeRph?.id || null;
  }

  let targetShiftId = event.shiftId;
  if (rphId) {
    const rph = await prisma.rencanaProduksi.findUnique({
      where: { id: rphId },
      select: { shiftId: true },
    });
    if (rph) targetShiftId = rph.shiftId;
  }

  // 2. If we have a clear target RPH/Shift, attribute the entire downtime to it.
  // This ensures Downtime stays in the same bucket as Production/Loading Time
  // even if it overflows into the next physical shift's time window.
  if (targetShiftId) {
    dataList.push({
      data: {
        andonEventId: event.id,
        shiftId: targetShiftId,
        mesinId: event.mesinId,
        rphId: rphId,
        waktuStart: triggerTime.toDate(),
        waktuEnd: resolveTime.toDate(),
        durasiMenit: totalDurationMenit,
        tanggal: event.tanggal,
        createdAt: nowWIB(),
      },
    });
    return dataList;
  }

  // 3. Fallback: Physical splitting (only if no RPH/Shift detected)
  const shifts = await prisma.shift.findMany();
  for (const shift of shifts) {
    const dateStr = moment(event.tanggal).tz(TZ).format("YYYY-MM-DD");
    const shiftStart = moment.tz(`${dateStr} ${shift.jamMasuk}`, "YYYY-MM-DD HH:mm", TZ);
    let shiftEnd = moment.tz(`${dateStr} ${shift.jamKeluar}`, "YYYY-MM-DD HH:mm", TZ);
    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, "day");

    const overlapStart = moment.max(triggerTime, shiftStart);
    const overlapEnd = moment.min(resolveTime, shiftEnd);

    if (overlapStart.isBefore(overlapEnd)) {
      dataList.push({
        data: {
          andonEventId: event.id,
          shiftId: shift.id,
          mesinId: event.mesinId,
          rphId: rphId,
          waktuStart: overlapStart.toDate(),
          waktuEnd: overlapEnd.toDate(),
          durasiMenit: Number((overlapEnd.diff(overlapStart, "milliseconds") / 60000).toFixed(2)),
          tanggal: event.tanggal,
          createdAt: nowWIB(),
        },
      });
    }
  }

  return dataList;
};

/**
 * Split downtime into shifts
 */
const splitDowntimePerShift = async (event, resolvedAt) => {
  const triggerTime = moment(event.waktuTrigger).tz(TZ);
  const resolveTime = moment(resolvedAt).tz(TZ);
  const totalDurationMs = moment(resolveTime).diff(triggerTime);
  const totalDurationMenit = Number((totalDurationMs / 60000).toFixed(2));

  // Determine RPH and Shift
  let rphId = event.rphOpenedId || event.rphClosedId || event.rphId;
  if (!rphId) {
    const activeRph = await prisma.rencanaProduksi.findFirst({
      where: { mesinId: event.mesinId, status: "ACTIVE" },
    });
    rphId = activeRph?.id || null;
  }

  let targetShiftId = event.shiftId;
  if (rphId) {
    const rph = await prisma.rencanaProduksi.findUnique({
      where: { id: rphId },
      select: { shiftId: true },
    });
    if (rph) targetShiftId = rph.shiftId;
  }

  if (targetShiftId) {
    await prisma.andonDowntimeShift.create({
      data: {
        andonEventId: event.id,
        shiftId: targetShiftId,
        mesinId: event.mesinId,
        rphId: rphId,
        waktuStart: triggerTime.toDate(),
        waktuEnd: resolveTime.toDate(),
        durasiMenit: totalDurationMenit,
        tanggal: event.tanggal,
        createdAt: nowWIB(),
      },
    });
    return;
  }

  // Fallback
  const shifts = await prisma.shift.findMany();
  for (const shift of shifts) {
    const dateStr = moment(event.tanggal).tz(TZ).format("YYYY-MM-DD");
    const shiftStart = moment.tz(`${dateStr} ${shift.jamMasuk}`, "YYYY-MM-DD HH:mm", TZ);
    let shiftEnd = moment.tz(`${dateStr} ${shift.jamKeluar}`, "YYYY-MM-DD HH:mm", TZ);
    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, "day");

    const overlapStart = moment.max(triggerTime, shiftStart);
    const overlapEnd = moment.min(resolveTime, shiftEnd);

    if (overlapStart.isBefore(overlapEnd)) {
      await prisma.andonDowntimeShift.create({
        data: {
          andonEventId: event.id,
          shiftId: shift.id,
          mesinId: event.mesinId,
          rphId: rphId,
          waktuStart: overlapStart.toDate(),
          waktuEnd: overlapEnd.toDate(),
          durasiMenit: Number((overlapEnd.diff(overlapStart, "milliseconds") / 60000).toFixed(2)),
          tanggal: event.tanggal,
          createdAt: nowWIB(),
        },
      });
    }
  }
};

/**
 * Personal History Downtime Andon (Today Only)
 */
const getPersonalHistory = async (userId, query = {}) => {
  const { mesinId, rphId } = query;
  const now = moment().tz(TZ);
  const dateStr = now.format("YYYY-MM-DD");

  

  // 1. Determine Operational Date & Shift
  const { operationalDate: opDateStr, shiftId: currentShiftId } = await getShiftInfo(now.toDate());
  const operationalDateStart = moment(opDateStr).startOf("day").toDate();
  const operationalDateEnd = moment(opDateStr).endOf("day").toDate();

  let historyWhere = {};

  if (rphId && !Number.isNaN(Number(rphId))) {
    historyWhere = { rphId: Number(rphId) };
  } else {
    // 2. Fetch User's Current Active RPH (Only if rphId not provided)
    const activeRph = await prisma.rencanaProduksi.findFirst({
      where: {
        userId: Number(userId),
        status: "ACTIVE",
        ...(mesinId && !Number.isNaN(Number(mesinId)) ? { mesinId: Number(mesinId) } : {}),
        tanggal: { gte: operationalDateStart, lte: operationalDateEnd },
      },
      orderBy: { id: "desc" },
    });

    if (activeRph) {
      historyWhere = { rphId: activeRph.id };
    } else {
      historyWhere = {
        tanggal: { gte: operationalDateStart, lte: operationalDateEnd },
        ...(mesinId && !Number.isNaN(Number(mesinId)) ? { mesinId: Number(mesinId) } : {}),
        OR: [
          { operatorId: Number(userId) },
          { resolvedById: Number(userId) },
        ],
      };
    }
  }

  const events = await prisma.andonEvent.findMany({
    where: historyWhere,
    include: {
      shift: true,
      masterMasalahAndon: true,
      mesin: true,
    },
    orderBy: { waktuTrigger: "desc" },
  });

  // LOG AFTER
  // 3. Helper: Shift Duration
  let totalShiftMenit = 480; // Default fallback (8 hours)
  let shiftName = "-";
  let jamMasuk = null;
  let jamKeluar = null;

  // Attempt to identify shift from events or current time
  let referenceShift = null;
  if (events.length > 0 && events[0].shift) {
    referenceShift = events[0].shift;
  } else if (currentShiftId) {
    referenceShift = await prisma.shift.findUnique({
      where: { id: currentShiftId },
    });
  } else {
    referenceShift = await prisma.shift.findFirst();
  }

  // Helper: Get Effective Shift Minutes (Static Mapping)
  const getEffectiveShiftMinutes = (tipeShift) => {
    switch (tipeShift) {
      case "Normal":
      case "Group":
        return 420;
      case "Long Shift":
        return 600;
      default:
        return 420;
    }
  };

  if (referenceShift) {
    shiftName = referenceShift.namaShift;
    totalShiftMenit = getEffectiveShiftMinutes(referenceShift.tipeShift);
    jamMasuk = referenceShift.jamMasuk;
    jamKeluar = referenceShift.jamKeluar;
  }

  // 4. Split Downtime & Calculate
  let planDowntime = 0;
  let breakdownDowntime = 0;

  const historyPlan = [];
  const historyBreakdown = [];

  events.forEach((e) => {
    console.log(`[Andon] id=${e.id}, waktuTrigger=${e.waktuTrigger}, waktuResolved=${e.waktuResolved}`);
    const durasi = e.durasiDowntime || 0;
    const isPlan = e.masterMasalahAndon?.kategori === "PLAN_DOWNTIME";

    // Format params
    const item = {
      id: e.id,
      mesinId: e.mesinId,
      mesin: e.mesin?.namaMesin || "-",
      masalah: e.masterMasalahAndon?.namaMasalah || "-",
      kategori: e.masterMasalahAndon?.kategori || "-",
      waktuTrigger: e.waktuTrigger,
      waktuResolved: e.waktuResolved,
      durasi: durasi,
      status: e.status,
      catatan: e.catatan,
      rphId: e.rphId,
    };

    if (isPlan) {
      planDowntime += durasi;
      historyPlan.push(item);
    } else {
      breakdownDowntime += durasi;
      historyBreakdown.push(item);
    }
  });

  // 5. Calculate Limits & Percentages
  const planLimit = totalShiftMenit * 0.1;
  const breakdownLimit = totalShiftMenit * 0.15;

  const totalDowntime = planDowntime + breakdownDowntime;
  const totalPercentage =
    totalShiftMenit > 0 ? (totalDowntime / totalShiftMenit) * 100 : 0;

  // Plan Stats
  const planPctShift =
    totalShiftMenit > 0 ? (planDowntime / totalShiftMenit) * 100 : 0;
  const planPctLimit = planLimit > 0 ? (planDowntime / planLimit) * 100 : 0;

  // Breakdown Stats
  const breakdownPctShift =
    totalShiftMenit > 0 ? (breakdownDowntime / totalShiftMenit) * 100 : 0;
  const breakdownPctLimit =
    breakdownLimit > 0 ? (breakdownDowntime / breakdownLimit) * 100 : 0;

  // 6. Return Formatted Response
  // function roundToTwo(num) is implied by usage of .toFixed(2) cast to Number
  const round = (n) => Number(n.toFixed(2));

  return {
    summary: {
      date: opDateStr,
      effective_shift_minutes: totalShiftMenit,

      total_downtime: round(totalDowntime),
      total_percentage: round(totalPercentage),

      plan_downtime: {
        total: round(planDowntime),
        limit: round(planLimit),
        percentage_of_shift: round(planPctShift),
        percentage_of_limit: round(planPctLimit),
      },

      breakdown_downtime: {
        total: round(breakdownDowntime),
        limit: round(breakdownLimit),
        percentage_of_shift: round(breakdownPctShift),
        percentage_of_limit: round(breakdownPctLimit),
      },
    },

    history: {
      plan_downtime: historyPlan,
      breakdown: historyBreakdown,
    },
  };
};

const getActiveEvents = async (userId, query = {}) => {
  const { mesinId } = query;
  const filter = mesinId ? { mesinId: Number(mesinId) } : {};
  const userFilter = userId
    ? {
      calls: { operatorId: Number(userId) },
      events: {
        OR: [
          { operatorId: Number(userId) },
          { resolvedById: Number(userId) },
        ],
      },
    }
    : { calls: {}, events: {} };

  const [calls, events] = await Promise.all([
    prisma.andonCall.findMany({
      where: {
        status: "WAITING",
        ...userFilter.calls,
        ...filter,
      },
      include: {
        mesin: true,
        operator: true,
        shift: true,
        divisi: true,
      },
      orderBy: { waktuCall: "desc" },
    }),
    prisma.andonEvent.findMany({
      where: {
        status: { in: ["ACTIVE", "IN_REPAIR"] },
        ...userFilter.events,
        ...filter,
      },
      include: { mesin: true, masterMasalahAndon: true, operator: true, shift: true },
      orderBy: { waktuTrigger: "desc" },
    }),
  ]);

  return {
    calls,
    repairs: events,
  };
};

const getMyActiveEvents = async (userId, query = {}) => {
  const { calls, repairs } = await getActiveEvents(userId, query);

  const mappedCalls = calls.map((c) => ({
    id: c.id,
    type: "CALL",
    status: c.status,
    kategori: c.targetDivisi, // For calls, use target_divisi as category
    masalah: "-", // Calls don't have problems yet
    teknisi: "-",
    startTime: c.waktuCall,
    mesin: c.mesin?.namaMesin || "-",
  }));

  const mappedRepairs = repairs.map((r) => ({
    id: r.id,
    type: "EVENT",
    status: r.status,
    kategori: r.masterMasalahAndon?.kategori || "-",
    masalah: r.masterMasalahAndon?.namaMasalah || "-",
    teknisi: r.resolvedBy?.nama || "-",
    startTime: r.waktuTrigger,
    mesin: r.mesin?.namaMesin || "-",
    estimated_minutes: r.masterMasalahAndon?.waktuPerbaikanMenit || 0,
  }));

  return [...mappedCalls, ...mappedRepairs];
};

/**
 * Unified Dashboard Data
 */
const getDashboardData = async (query) => {
  const {
    date,
    shiftId,
    plantId = "Semua Plant",
    mesinId,
    kategori = "Semua Kategori",
    page = 1,
    limit = 20,
    onlyHistory,
  } = query;

  let dateStr = date;
  if (!dateStr) {
    const { operationalDate: opDate } = await getShiftInfo(new Date());
    dateStr = opDate;
  }
  // Operational Date MUST be UTC midnight for @db.Date fields to match correctly
  const operationalDate = new Date(`${dateStr}T00:00:00.000Z`);

  // Filters
  const plantFilter =
    plantId && plantId !== "0" && plantId !== "Semua Plant"
      ? { plant: plantId }
      : {};
  const shiftFilter = shiftId ? { shiftId: Number(shiftId) } : {};
  const mesinFilter =
    mesinId && mesinId !== "0" && mesinId !== "Semua Mesin"
      ? { mesinId: Number(mesinId) }
      : {};
  const kategoriFilter =
    kategori && kategori !== "Semua Kategori"
      ? { masterMasalahAndon: { kategori: kategori } }
      : {};

  // History Filter: Based on exact operational date (RESOLVED only)
  const historyWhere = {
    status: "RESOLVED",
    tanggal: operationalDate,
    ...plantFilter,
    ...shiftFilter,
    ...mesinFilter,
    kategori:
      kategori && kategori !== "Semua Kategori"
        ? kategori
        : { not: "PLAN_DOWNTIME" },
  };

  if (onlyHistory === "true" || onlyHistory === true) {
    return {
      summary: null,
      plants: null,
      activeEvents: null,
      history: await fetchHistoryHelper(historyWhere, page, limit),
    };
  }

  // Full Dashboard
  const inRepairWhere = {
    status: "IN_REPAIR",
    ...plantFilter,
    ...kategoriFilter,
  };
  const waitingCallWhere = { status: "WAITING", ...plantFilter };

  const [
    resolvedToday,
    aggTotal,
    totalActiveRepair,
    totalActiveCall,
    plantsRaw,
    callsRaw,
    repairsRaw,
    historyData,
  ] = await Promise.all([
    prisma.andonEvent.count({
      where: {
        status: "RESOLVED",
        tanggal: operationalDate,
        kategori: { not: "PLAN_DOWNTIME" },
        ...shiftFilter,
        ...plantFilter,
        ...mesinFilter,
        ...kategoriFilter,
      },
    }),
    prisma.andonEvent.aggregate({
      _sum: { totalDurationMenit: true },
      where: {
        status: "RESOLVED",
        tanggal: operationalDate,
        kategori: { not: "PLAN_DOWNTIME" },
        ...shiftFilter,
        ...plantFilter,
        ...mesinFilter,
        ...kategoriFilter,
      },
    }),
    // Total Active Repair (IN_REPAIR)
    prisma.andonEvent.count({
      where: {
        ...inRepairWhere,
        kategori: { not: "PLAN_DOWNTIME" },
      },
    }),
    // Total Active Call (WAITING)
    prisma.andonCall.count({
      where: { ...waitingCallWhere, ...mesinFilter },
    }),
    prisma.andonEvent.findMany({
      where: {
        ...inRepairWhere,
        kategori: { not: "PLAN_DOWNTIME" },
      },
      select: { plant: true },
    }),
    // WAITING calls
    prisma.andonCall.findMany({
      where: { ...waitingCallWhere, ...mesinFilter },
      include: {
        mesin: true,
        operator: true,
        shift: true,
        divisi: true,
      },
      orderBy: { waktuCall: "desc" },
    }),
    // IN_REPAIR events
    prisma.andonEvent.findMany({
      where: {
        ...inRepairWhere,
        ...mesinFilter,
        kategori: { not: "PLAN_DOWNTIME" },
      },
      select: {
        id: true,
        waktuTrigger: true,
        status: true,
        mesin: { select: { namaMesin: true, id: true } },
        masterMasalahAndon: {
          select: {
            namaMasalah: true,
            kategori: true,
            waktuPerbaikanMenit: true,
          },
        },
        operator: { select: { nama: true } },
        shift: { select: { namaShift: true } },
        resolvedBy: { select: { nama: true } },
      },
      orderBy: { waktuTrigger: "desc" },
    }),
    fetchHistoryHelper(historyWhere, page, limit),
  ]);

  // Process Plants
  const plantsMap = {};
  plantsRaw.forEach((e) => {
    const p = e.plant || "Unknown";
    plantsMap[p] = (plantsMap[p] || 0) + 1;
  });
  const plantsStatus = Object.keys(plantsMap).map((k, i) => ({
    id: i + 1,
    name: k,
    activeCount: plantsMap[k],
  }));

  // Process Repairs (IN_REPAIR events)
  const repairs = repairsRaw.map((e) => {
    const elapsed = moment().diff(moment(e.waktuTrigger), "minutes");
    const slaMenit = e.masterMasalahAndon?.waktuPerbaikanMenit || 0;
    let liveStatus = "ON_TIME";
    if (slaMenit > 0 && elapsed > slaMenit) liveStatus = "OVER_TIME";
    return {
      ...e,
      elapsed_minutes: elapsed,
      live_sla_status: liveStatus,
      estimasi_menit: slaMenit,
    };
  });

  return {
    summary: {
      resolvedToday,
      totalDowntime: Number(
        (aggTotal._sum.totalDurationMenit || 0).toFixed(2),
      ),
      totalActiveCall,
      totalActiveRepair,
    },
    plants: plantsStatus,
    activeEvents: {
      calls: callsRaw,
      repairs,
    },
    history: historyData,
  };
};

const getAndonFilters = async () => {
  const [shiftsRaw, machines] = await Promise.all([
    prisma.shift.findMany({
      select: {
        id: true,
        namaShift: true,
        tipeShift: true,
      },
    }),
    prisma.mesin.findMany({
      select: {
        id: true,
        namaMesin: true,
      },
      orderBy: {
        namaMesin: "asc",
      },
    }),
  ]);

  const categories = ["MAINTENANCE", "QUALITY", "PRODUKSI", "PLAN_DOWNTIME"];

  // Format shifts: namaShift + tipe_shift
  const shifts = shiftsRaw.map((s) => ({
    id: s.id,
    nama: `${s.namaShift} (${s.tipeShift})`,
  }));

  return {
    shifts,
    categories,
    machines,
  };
};

const getTriggerMasterData = async () => {
  const problems = await prisma.masterMasalahAndon.findMany({
    orderBy: {
      kategori: "asc",
    },
  });

  const categories = [
    "MAINTENANCE",
    "QUALITY",
    "DIE_MAINT",
    "PRODUKSI",
    "PLAN_DOWNTIME",
  ];

  return {
    categories,
    problems,
  };
};

export default {
  triggerAndon,
  startRepairAndon,
  resolveAndon,
  getActiveEvents,
  getMyActiveEvents,
  getDashboardData,
  getAndonFilters,
  getTriggerMasterData,
  getPersonalHistory,
  calculateAndonSummary,
};