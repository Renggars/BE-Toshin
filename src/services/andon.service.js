import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";
import moment from "moment-timezone"; // Changed to moment-timezone
import oeeService from "./oee.service.js";
import {
  emitAndonUpdate,
  emitAndonDashboardUpdate,
  emitAndonCreated,
  emitAndonResolved,
  emitAndonRepairStarted,
  emitAndonSummaryUpdated,
  emitAndonMetricChanged,
} from "../config/socket.js";

import logger from "../config/logger.js";

const TZ = "Asia/Jakarta";

/**
 * Helper: Determine Shift & Operational Date based on time (WIB)
 */
const getShiftInfo = async (time) => {
  const shifts = await prisma.shift.findMany();
  const timeMoment = moment(time).tz(TZ);
  const dateStr = timeMoment.format("YYYY-MM-DD");

  for (const shift of shifts) {
    const shiftStart = moment.tz(
      `${dateStr} ${shift.jam_masuk}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );
    let shiftEnd = moment.tz(
      `${dateStr} ${shift.jam_keluar}`,
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
        waktu_trigger: true,
        waktu_resolved: true,
        durasi_downtime: true,
        status: true,
        plant: true,
        respon_status: true,
        mesin: { select: { nama_mesin: true } },
        masalah: {
          select: {
            nama_masalah: true,
            kategori: true,
            waktu_perbaikan_menit: true,
          },
        },
        operator: { select: { nama: true } },
        resolver: { select: { nama: true } },
        shift: { select: { nama_shift: true } },
      },
      orderBy: { waktu_trigger: "desc" },
      skip,
      take,
    }),
    prisma.andonEvent.count({ where }),
  ]);

  const data = dataRaw.map((e) => ({
    id: e.id,
    tanggal: e.waktu_trigger,
    mesin: e.mesin?.nama_mesin,
    plant: e.plant,
    shift: e.shift?.nama_shift,
    masalah: e.masalah?.nama_masalah,
    kategori: e.masalah?.kategori,
    operator: e.operator?.nama || "-",
    resolver: e.resolver?.nama || "-",
    downtime: e.durasi_downtime || 0,
    status: e.status,
    estimasi_menit: e.masalah?.waktu_perbaikan_menit || 0,
    waktu_resolved: e.waktu_resolved,
    respon_status: e.respon_status,
  }));

  return {
    data,
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
  const dateStr = moment().tz(TZ).format("YYYY-MM-DD");
  const operationalDate = new Date(`${dateStr}T00:00:00.000Z`);

  const [resolvedToday, avgDowntimeAgg, totalActiveRepair, totalActiveCall] =
    await Promise.all([
      prisma.andonEvent.count({
        where: {
          status: "RESOLVED",
          tanggal: operationalDate,
          ...plantFilter,
        },
      }),
      prisma.andonEvent.aggregate({
        _avg: { durasi_downtime: true },
        where: {
          status: "RESOLVED",
          tanggal: operationalDate,
          ...plantFilter,
        },
      }),
      // Total Active Repair (IN_REPAIR)
      prisma.andonEvent.count({
        where: {
          status: "IN_REPAIR",
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
    avgDowntime: Math.round(avgDowntimeAgg._avg.durasi_downtime || 0),
    totalActiveCall,
    totalActiveRepair,
  };
};

/**
 * Smart Trigger: Auto-detect Operator & Shift from RPH
 */
const triggerAndon = async (payload) => {
  const {
    fk_id_mesin: rawMesinId,
    fk_id_masalah,
    fk_id_operator: manualOperator,
  } = payload;
  const fk_id_mesin = Number(rawMesinId);
  const currentTime = moment().tz(TZ);

  // Check for existing active andon
  const active = await prisma.andonEvent.findFirst({
    where: { fk_id_mesin, status: "ACTIVE" },
  });

  if (active) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Masih ada Andon ACTIVE di mesin ini",
    );
  }

  // 1. Get Shift Info & Operational Date
  const { shiftId, operationalDate: opDateStr } = await getShiftInfo(
    currentTime.toDate(),
  );
  const operationalDate = new Date(`${opDateStr}T00:00:00.000Z`);

  // 2. Fetch RPH Candidates for this machine on this operational date
  const rphCandidates = await prisma.rencanaProduksi.findMany({
    where: {
      fk_id_mesin,
      tanggal: operationalDate,
    },
    include: { shift: true },
  });

  let detectedOperator = manualOperator || null;
  let detectedShift = shiftId;

  // 3. Find Exact Match (Machine + Shift + Date)
  const exactMatch = rphCandidates.find((r) => r.fk_id_shift === shiftId);
  if (exactMatch) {
    detectedOperator = exactMatch.fk_id_user;
  }
  // 4. Fallback: If no exact shift match, but there are RPHs today (Smart Detect)
  else if (!detectedOperator && rphCandidates.length > 0) {
    // Pick the first available assignment for this machine today
    detectedOperator = rphCandidates[0].fk_id_user;
    // If we didn't have a shiftId yet, take it from RPH
    if (!detectedShift) detectedShift = rphCandidates[0].fk_id_shift;
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

  // 6. Fetch Masalah to check for RPH Switch category
  const masalah = await prisma.masterMasalahAndon.findUnique({
    where: { id: fk_id_masalah },
  });
  if (!masalah)
    throw new ApiError(httpStatus.NOT_FOUND, "Masalah tidak ditemukan");

  // Flow Checklist: only PLAN_DOWNTIME can bypass Call phase
  if (masalah.kategori !== "PLAN_DOWNTIME") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Kategori ${masalah.kategori} harus melalui flow Call (POST /andon/call) terlebih dahulu`,
    );
  }

  const RPH_SWITCH_NAMES = [
    "Pindah Mesin",
    "Pindah Produk",
    "Pindah Jenis Pekerjaan",
  ];
  const isRphSwitch =
    masalah.kategori === "PLAN_DOWNTIME" &&
    RPH_SWITCH_NAMES.includes(masalah.nama_masalah);

  let newEvent;
  let activeRphId = null;

  if (isRphSwitch) {
    // 7. Handle RPH Switch Invariants
    const currentActiveRph = await prisma.rencanaProduksi.findFirst({
      where: { fk_id_mesin, status: "ACTIVE" },
    });

    if (!currentActiveRph) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Tidak bisa melakukan RPH Switch karena tidak ada RPH yang sedang ACTIVE di mesin ini",
      );
    }

    const pendingRph = await prisma.rencanaProduksi.findFirst({
      where: { fk_id_mesin, status: "WAITING_START" },
    });

    if (pendingRph) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Sudah ada RPH yang menunggu untuk dimulai (WAITING_START)",
      );
    }

    const nextPlannedRph = await prisma.rencanaProduksi.findFirst({
      where: { fk_id_mesin, status: "PLANNED", tanggal: operationalDate },
      orderBy: { id: "asc" },
    });

    if (!nextPlannedRph) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Tidak ada RPH berikutnya (PLANNED) untuk dialihkan",
      );
    }

    // Perform state transitions + event creation in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Close active RPH if it exists
      if (currentActiveRph) {
        await tx.rencanaProduksi.update({
          where: { id: currentActiveRph.id },
          data: { status: "CLOSED", end_time: currentTime.toDate() },
        });
        activeRphId = currentActiveRph.id;
      }

      // Set next planned to waiting
      if (nextPlannedRph) {
        await tx.rencanaProduksi.update({
          where: { id: nextPlannedRph.id },
          data: { status: "WAITING_START" },
        });
      }

      return tx.andonEvent.create({
        data: {
          fk_id_mesin,
          fk_id_masalah,
          fk_id_operator: detectedOperator,
          fk_id_shift: detectedShift,
          tanggal: operationalDate,
          plant: plantName,
          status: "ACTIVE",
          fk_id_rph_closed: activeRphId,
        },
        include: { mesin: true, masalah: true, operator: true, shift: true },
      });
    });
    newEvent = result;
  } else {
    // Normal Andon Trigger
    newEvent = await prisma.andonEvent.create({
      data: {
        fk_id_mesin,
        fk_id_masalah,
        fk_id_operator: detectedOperator,
        fk_id_shift: detectedShift,
        tanggal: operationalDate,
        plant: plantName,
        status: "ACTIVE",
      },
      include: { mesin: true, masalah: true, operator: true, shift: true },
    });
  }

  // ✅ NEW: Emit specific WebSocket events following contract
  // Event 1: andon-created
  emitAndonCreated({
    andonId: newEvent.id,
    machineId: newEvent.fk_id_mesin,
    machineName: newEvent.mesin?.nama_mesin || "Unknown",
    type: newEvent.masalah?.kategori || "UNKNOWN",
    problemName: newEvent.masalah?.nama_masalah || "Unknown Problem",
    startTime: newEvent.waktu_trigger,
    status: "ACTIVE",
    plant: newEvent.plant || "Unknown",
    operator: newEvent.operator?.nama || "-",
    shift: newEvent.shift?.nama_shift || "-",
  });

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
    mesinId: fk_id_mesin,
    plant: plantName,
    tanggal: opDateStr,
  });

  return newEvent;
};

/**
 * Start Repair Andon
 */
const startRepairAndon = async (id, data) => {
  const { userId, fk_id_masalah } = data;

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

    if (!fk_id_masalah) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "fk_id_masalah wajib diisi untuk konversi call ke event",
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
      PRODUKSI: "PRODUKSI",
    };

    const requiredRole = roleMapping[call.target_divisi];

    // Authorize: Only matching role, or SUPERVISOR/ADMIN can start repair
    if (
      user.role !== requiredRole &&
      user.role !== "SUPERVISOR" &&
      user.role !== "ADMIN"
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `Hanya role ${requiredRole} yang boleh melakukan start repair untuk target divisi ${call.target_divisi}`,
      );
    }

    const problem = await prisma.masterMasalahAndon.findUnique({
      where: { id: fk_id_masalah },
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
      const event = await tx.andonEvent.create({
        data: {
          fk_id_mesin: call.fk_id_mesin,
          fk_id_operator: call.fk_id_operator,
          fk_id_shift: call.fk_id_shift,
          fk_id_masalah: fk_id_masalah,
          waktu_trigger: call.waktu_call, // waktu_trigger = call.waktu_call
          waktu_repair: new Date(), // waktu_repair = now()
          status: "IN_REPAIR",
          tanggal: call.tanggal,
          plant: call.plant,
          resolved_by: userId,
        },
        include: { mesin: true, masalah: true, operator: true, shift: true },
      });

      await tx.andonCall.update({
        where: { id: call.id },
        data: {
          status: "CONVERTED",
          converted_event: event.id,
        },
      });

      return event;
    });

    const formattedEvent = {
      id: newEvent.id,
      tanggal: newEvent.waktu_trigger,
      mesin: newEvent.mesin?.nama_mesin || "Unknown",
      plant: newEvent.plant || "Unknown",
      shift: newEvent.shift?.nama_shift || "Unknown",
      masalah: newEvent.masalah?.nama_masalah || "Unknown",
      kategori: newEvent.masalah?.kategori || "UNKNOWN",
      operator: newEvent.operator?.nama || "-",
      resolver: user.nama || "-",
      downtime: 0,
      status: "IN_REPAIR",
      estimasi_menit: newEvent.masalah?.waktu_perbaikan_menit || 0,
      waktu_resolved: null,
      respon_status: null,
    };

    emitAndonRepairStarted(formattedEvent);
    const plantFilter = newEvent.plant ? { plant: newEvent.plant } : {};
    const summary = await calculateAndonSummary(plantFilter);
    emitAndonSummaryUpdated(summary);

    return newEvent;
  }

  // 2. Fallback to existing AndonEvent logic (e.g. for PLAN_DOWNTIME)
  const event = await prisma.andonEvent.findUnique({ where: { id } });

  if (!event || event.status !== "ACTIVE") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Hanya Andon ACTIVE (atau WAITING Call) yang bisa mulai diperbaiki",
    );
  }

  const updated = await prisma.andonEvent.update({
    where: { id },
    data: {
      status: "IN_REPAIR",
      waktu_repair: new Date(),
      resolved_by: userId,
      fk_id_masalah: fk_id_masalah || event.fk_id_masalah,
    },
    include: { mesin: true, masalah: true, operator: true, shift: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { nama: true },
  });

  const formattedEvent = {
    id: updated.id,
    tanggal: updated.waktu_trigger,
    mesin: updated.mesin?.nama_mesin || "Unknown",
    plant: updated.plant || "Unknown",
    shift: updated.shift?.nama_shift || "Unknown",
    masalah: updated.masalah?.nama_masalah || "Unknown",
    kategori: updated.masalah?.kategori || "UNKNOWN",
    operator: updated.operator?.nama || "-",
    resolver: user?.nama || "-",
    downtime: 0,
    status: "IN_REPAIR",
    estimasi_menit: updated.masalah?.waktu_perbaikan_menit || 0,
    waktu_resolved: null,
    respon_status: null,
  };

  emitAndonRepairStarted(formattedEvent);
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
    include: { masalah: true },
  });

  if (!event || event.status === "RESOLVED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Andon invalid atau sudah RESOLVED",
    );
  }

  // State Machine Validation
  const isPlanDowntime = event.masalah?.kategori === "PLAN_DOWNTIME";
  if (!isPlanDowntime && event.status !== "IN_REPAIR") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Perbaikan harus dimulai (IN_REPAIR) sebelum di-resolve",
    );
  }

  const resolvedAt = new Date();
  const triggerAt = new Date(event.waktu_trigger);
  const durationMs = resolvedAt - triggerAt;

  // Real decimal minutes (2 decimal precision)
  const totalDurationMinutes = Number((durationMs / 60000).toFixed(2));
  const standardMinutes = event.masalah?.waktu_perbaikan_menit || 0;
  const lateMinutes = Number(
    Math.max(0, totalDurationMinutes - standardMinutes).toFixed(2),
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
    event.masalah?.kategori === "PLAN_DOWNTIME" &&
    RPH_SWITCH_NAMES.includes(event.masalah?.nama_masalah);

  // Use Transaction for Atomicity
  const [updatedEvent] = await prisma.$transaction(async (tx) => {
    let openedRphId = null;

    if (isRphSwitch) {
      // Find WAITING_START RPH to activate
      const waitingRph = await tx.rencanaProduksi.findFirst({
        where: { fk_id_mesin: event.fk_id_mesin, status: "WAITING_START" },
      });

      if (waitingRph) {
        // Guard: Ensure no other RPH is ACTIVE
        const otherActive = await tx.rencanaProduksi.findFirst({
          where: {
            fk_id_mesin: event.fk_id_mesin,
            status: "ACTIVE",
            NOT: { id: waitingRph.id },
          },
        });

        if (otherActive) {
          throw new ApiError(
            httpStatus.CONFLICT,
            "Tidak bisa mengaktifkan RPH baru karena masih ada RPH ACTIVE di mesin ini. Selesaikan RPH sebelumnya dulu.",
          );
        }

        await tx.rencanaProduksi.update({
          where: { id: waitingRph.id },
          data: { status: "ACTIVE", start_time: resolvedAt },
        });
        openedRphId = waitingRph.id;
      }
    }

    const updated = await tx.andonEvent.update({
      where: { id },
      data: {
        status: "RESOLVED",
        waktu_resolved: resolvedAt,
        durasi_downtime: totalDurationMinutes,
        total_duration_menit: totalDurationMinutes,
        late_menit: lateMinutes,
        is_late: isLate,
        resolved_by: data.resolved_by || event.resolved_by,
        respon_status: responStatus,
        fk_id_rph_opened: openedRphId,
      },
      include: { mesin: true, masalah: true, operator: true, shift: true },
    });

    const splitPromises = await generateSplitDowntimePromises(
      event,
      resolvedAt,
    );
    for (const p of splitPromises) {
      await tx.andonDowntimeShift.create({ data: p.data });
    }

    return [updated];
  });

  await oeeService.recalculateByMesin(event.fk_id_mesin, event.tanggal);

  // ✅ WebSocket Events
  const resolverUser = await prisma.user.findUnique({
    where: { id: data.resolved_by || event.resolved_by },
    select: { nama: true },
  });

  emitAndonResolved({
    id: updatedEvent.id,
    tanggal: updatedEvent.waktu_trigger,
    mesin: updatedEvent.mesin?.nama_mesin || "Unknown",
    plant: updatedEvent.plant || "Unknown",
    shift: updatedEvent.shift?.nama_shift || "Unknown",
    masalah: updatedEvent.masalah?.nama_masalah || "Unknown",
    kategori: updatedEvent.masalah?.kategori || "UNKNOWN",
    operator: updatedEvent.operator?.nama || "-",
    resolver: resolverUser?.nama || "-",
    downtime: totalDurationMinutes,
    status: "RESOLVED",
    estimasi_menit: updatedEvent.masalah?.waktu_perbaikan_menit || 0,
    waktu_resolved: resolvedAt,
    respon_status: responStatus,
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
    mesinId: event.fk_id_mesin,
    plant: event.plant,
    tanggal: moment(event.tanggal).format("YYYY-MM-DD"),
  });

  const waitTime = event.waktu_repair
    ? Number(
        (
          (new Date(event.waktu_repair) - new Date(event.waktu_trigger)) /
          60000
        ).toFixed(2),
      )
    : 0;

  return {
    andon_event: updatedEvent,
    durasi_downtime: totalDurationMinutes,
    waktu_tunggu_maintenance: waitTime,
    affected_shift: await prisma.andonDowntimeShift.findMany({
      where: { fk_id_andon: id },
    }),
  };
};

/**
 * Helper: Generate promises for splitting downtime
 */
const generateSplitDowntimePromises = async (event, resolvedAt) => {
  const shifts = await prisma.shift.findMany();
  const triggerTime = moment(event.waktu_trigger).tz(TZ);
  const resolveTime = moment(resolvedAt).tz(TZ);
  const dataList = [];

  // Determine RPH to attribute downtime to
  // Rule: CHANGE_RPH belongs to closed RPH. Others belong to active RPH at trigger time.
  let rphId = event.fk_id_rph_closed;
  if (!rphId) {
    const activeRph = await prisma.rencanaProduksi.findFirst({
      where: {
        fk_id_mesin: event.fk_id_mesin,
        status: "ACTIVE",
        // Fallback or specific window check could be added here
      },
    });
    rphId = activeRph?.id || null;
  }

  for (const shift of shifts) {
    const dateStr = triggerTime.format("YYYY-MM-DD");
    const shiftStart = moment.tz(
      `${dateStr} ${shift.jam_masuk}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );
    let shiftEnd = moment.tz(
      `${dateStr} ${shift.jam_keluar}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );

    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, "day");

    const overlapStart = moment.max(triggerTime, shiftStart);
    const overlapEnd = moment.min(resolveTime, shiftEnd);

    if (overlapStart.isBefore(overlapEnd)) {
      const minutes = overlapEnd.diff(overlapStart, "minutes");
      dataList.push({
        data: {
          fk_id_andon: event.id,
          fk_id_shift: shift.id,
          fk_id_mesin: event.fk_id_mesin,
          fk_id_rph: rphId,
          waktu_start: overlapStart.toDate(),
          waktu_end: overlapEnd.toDate(),
          durasi_menit: Number(
            (overlapEnd.diff(overlapStart, "milliseconds") / 60000).toFixed(2),
          ),
          tanggal: event.tanggal,
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
  const shifts = await prisma.shift.findMany();
  const triggerTime = moment(event.waktu_trigger).tz(TZ);
  const resolveTime = moment(resolvedAt).tz(TZ);

  // Determine RPH
  let rphId = event.fk_id_rph_closed;
  if (!rphId) {
    const activeRph = await prisma.rencanaProduksi.findFirst({
      where: { fk_id_mesin: event.fk_id_mesin, status: "ACTIVE" },
    });
    rphId = activeRph?.id || null;
  }

  for (const shift of shifts) {
    const dateStr = triggerTime.format("YYYY-MM-DD");
    const shiftStart = moment.tz(
      `${dateStr} ${shift.jam_masuk}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );
    let shiftEnd = moment.tz(
      `${dateStr} ${shift.jam_keluar}`,
      "YYYY-MM-DD HH:mm",
      TZ,
    );

    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, "day");

    // Overlap calculation
    const overlapStart = moment.max(triggerTime, shiftStart);
    const overlapEnd = moment.min(resolveTime, shiftEnd);

    if (overlapStart.isBefore(overlapEnd)) {
      const minutes = overlapEnd.diff(overlapStart, "minutes");
      await prisma.andonDowntimeShift.create({
        data: {
          fk_id_andon: event.id,
          fk_id_shift: shift.id,
          fk_id_mesin: event.fk_id_mesin,
          fk_id_rph: rphId,
          waktu_start: overlapStart.toDate(),
          waktu_end: overlapEnd.toDate(),
          durasi_menit: Number(
            (overlapEnd.diff(overlapStart, "milliseconds") / 60000).toFixed(2),
          ),
          tanggal: event.tanggal, // Operational date from parent
        },
      });
    }
  }
};

/**
 * Personal History Downtime Andon (Today Only)
 */
const getPersonalHistory = async (userId) => {
  const now = moment().tz(TZ);
  const dateStr = now.format("YYYY-MM-DD");

  // 1. Determine Operational Date & Shift
  // Logic: "now" -> getShiftInfo -> opDate & shiftId.
  const { operationalDate: opDateStr, shiftId: currentShiftId } =
    await getShiftInfo(now.toDate());
  const operationalDate = new Date(`${opDateStr}T00:00:00.000Z`);

  // 2. Fetch User's Downtime Events (Today)
  const events = await prisma.andonEvent.findMany({
    where: {
      AND: [
        { tanggal: operationalDate },
        {
          OR: [
            { fk_id_operator: Number(userId) },
            { resolved_by: Number(userId) },
          ],
        },
      ],
    },
    include: {
      shift: true,
      masalah: true,
      mesin: true,
    },
    orderBy: { waktu_trigger: "desc" },
  });

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
    shiftName = referenceShift.nama_shift;
    totalShiftMenit = getEffectiveShiftMinutes(referenceShift.tipe_shift);
    jamMasuk = referenceShift.jam_masuk;
    jamKeluar = referenceShift.jam_keluar;
  }

  // 4. Split Downtime & Calculate
  let planDowntime = 0;
  let breakdownDowntime = 0;

  const historyPlan = [];
  const historyBreakdown = [];

  events.forEach((e) => {
    const durasi = e.durasi_downtime || 0;
    const isPlan = e.masalah?.kategori === "PLAN_DOWNTIME";

    // Format params
    const item = {
      id: e.id,
      mesin: e.mesin?.nama_mesin || "-",
      masalah: e.masalah?.nama_masalah || "-",
      kategori: e.masalah?.kategori || "-",
      waktu_trigger: e.waktu_trigger,
      waktu_resolved: e.waktu_resolved,
      durasi: durasi,
      status: e.status,
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

const getActiveEvents = async () => {
  const [calls, events] = await Promise.all([
    prisma.andonCall.findMany({
      where: { status: "WAITING" },
      include: {
        mesin: true,
        operator: true,
        shift: true,
        divisi_target: true,
      },
      orderBy: { waktu_call: "desc" },
    }),
    prisma.andonEvent.findMany({
      where: { status: "IN_REPAIR" },
      include: { mesin: true, masalah: true, operator: true, shift: true },
      orderBy: { waktu_trigger: "desc" },
    }),
  ]);

  return {
    calls,
    repairs: events,
  };
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

  const dateStr = date || moment().tz(TZ).format("YYYY-MM-DD");
  // Operational Date MUST be UTC midnight for @db.Date fields to match correctly
  const operationalDate = new Date(`${dateStr}T00:00:00.000Z`);

  // Filters
  const plantFilter =
    plantId && plantId !== "0" && plantId !== "Semua Plant"
      ? { plant: plantId }
      : {};
  const shiftFilter = shiftId ? { fk_id_shift: Number(shiftId) } : {};
  const mesinFilter =
    mesinId && mesinId !== "0" && mesinId !== "Semua Mesin"
      ? { fk_id_mesin: Number(mesinId) }
      : {};
  const kategoriFilter =
    kategori && kategori !== "Semua Kategori"
      ? { masalah: { kategori: kategori } }
      : {};

  // History Filter: Based on exact operational date (RESOLVED only)
  const historyWhere = {
    status: "RESOLVED",
    tanggal: operationalDate,
    ...plantFilter,
    ...shiftFilter,
    ...mesinFilter,
    ...kategoriFilter,
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
    avgDowntimeAgg,
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
        ...shiftFilter,
        ...plantFilter,
        ...mesinFilter,
        ...kategoriFilter,
      },
    }),
    prisma.andonEvent.aggregate({
      _avg: { durasi_downtime: true },
      where: {
        status: "RESOLVED",
        tanggal: operationalDate,
        ...shiftFilter,
        ...plantFilter,
        ...mesinFilter,
        ...kategoriFilter,
      },
    }),
    // Total Active Repair (IN_REPAIR)
    prisma.andonEvent.count({
      where: inRepairWhere,
    }),
    // Total Active Call (WAITING)
    prisma.andonCall.count({
      where: { ...waitingCallWhere, ...mesinFilter },
    }),
    prisma.andonEvent.findMany({
      where: inRepairWhere,
      select: { plant: true },
    }),
    // WAITING calls
    prisma.andonCall.findMany({
      where: { ...waitingCallWhere, ...mesinFilter },
      include: {
        mesin: true,
        operator: true,
        shift: true,
        divisi_target: true,
      },
      orderBy: { waktu_call: "desc" },
    }),
    // IN_REPAIR events
    prisma.andonEvent.findMany({
      where: {
        ...inRepairWhere,
        ...mesinFilter,
      },
      select: {
        id: true,
        waktu_trigger: true,
        status: true,
        mesin: { select: { nama_mesin: true, id: true } },
        masalah: {
          select: {
            nama_masalah: true,
            kategori: true,
            waktu_perbaikan_menit: true,
          },
        },
        operator: { select: { nama: true } },
        shift: { select: { nama_shift: true } },
        resolver: { select: { nama: true } },
      },
      orderBy: { waktu_trigger: "desc" },
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
    const elapsed = moment().diff(moment(e.waktu_trigger), "minutes");
    const slaMenit = e.masalah?.waktu_perbaikan_menit || 0;
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
      avgDowntime: Math.round(avgDowntimeAgg._avg.durasi_downtime || 0),
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
        nama_shift: true,
        tipe_shift: true,
      },
    }),
    prisma.mesin.findMany({
      select: {
        id: true,
        nama_mesin: true,
      },
      orderBy: {
        nama_mesin: "asc",
      },
    }),
  ]);

  const categories = ["MAINTENANCE", "QUALITY", "PRODUKSI", "PLAN_DOWNTIME"];

  // Format shifts: nama_shift + tipe_shift
  const shifts = shiftsRaw.map((s) => ({
    id: s.id,
    nama: `${s.nama_shift} (${s.tipe_shift})`,
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
    "QUALITY_CONTROL",
    "DIE_MAINTENANCE",
    "PRODUCTION",
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
  getDashboardData,
  getAndonFilters,
  getTriggerMasterData,
  getPersonalHistory,
  calculateAndonSummary,
};
