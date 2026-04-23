import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import poinService from "./poin.service.js";
import { nowWIB } from "../utils/dateWIB.js";

/**
 * Get all users scheduled for a specific shift, date, and optionally division
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
const getScheduledUsers = async ({ tanggal, shiftId, divisiId }) => {
  const where = {};

  if (tanggal) {
    where.tanggal = new Date(tanggal);
  }

  if (shiftId) {
    where.shiftId = parseInt(shiftId);
  }

  if (divisiId) {
    where.operator = {
      divisiId: parseInt(divisiId),
    };
  }

  const result = await prisma.rencanaProduksi.findMany({
    where,
    include: {
      operator: {
        select: {
          id: true,
          nama: true,
          uidNfc: true,
          divisiId: true,
          divisi: true,
        },
      },
      mesin: true,
      produk: true,
      attendance: true,
    },
  });

  return result
    .filter((r) => r.operator)
    .map((r) => {
      const attendance = r.attendance.length > 0 ? r.attendance[0] : null;

      return {
        rph_id: r.id,
        operator_id: r.operator.id,
        nama: r.operator.nama,
        statusAbsen: attendance ? "Hadir" : "Belum Hadir",
        is_terlambat: attendance ? attendance.isTerlambat : false,
        jam_tap: attendance ? attendance.jamTap : null,
      };
    });
};

/**
 * Get users who have already tapped/attended
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
const getPresentUsers = async ({ tanggal, shiftId, divisiId }) => {
  const where = {};

  if (tanggal) {
    where.tanggal = new Date(tanggal);
  }

  ``; // Filter based on related RencanaProduksi's shift
  if (shiftId) {
    where.rencanaProduksi = {
      shiftId: parseInt(shiftId),
    };
  }

  if (divisiId) {
    where.user = {
      divisiId: parseInt(divisiId),
    };
  }

  const result = await prisma.attendance.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          nama: true,
          uidNfc: true,
          divisiId: true,
          divisi: true,
        },
      },
      rencanaProduksi: {
        include: {
          mesin: true,
          shift: true,
        },
      },
    },
  });

  return result.map((a) => ({
    id: a.id,
    jam_tap: a.jamTap,
    is_terlambat: a.isTerlambat,
    user: a.user,
    shift: a.rencanaProduksi?.shift?.namaShift,
    mesin: a.rencanaProduksi?.mesin?.namaMesin,
  }));
};

const clockIn = async (user, req) => {
  if (user.role !== "PRODUKSI") return;

  const now = nowWIB();
  const dateStr = now.toLocaleDateString("en-CA"); // YYYY-MM-DD

  // 1. Cari RPH hari ini
  const rph = await prisma.rencanaProduksi.findFirst({
    where: {
      userId: user.id,
      tanggal: new Date(dateStr),
    },
    include: { shift: true },
  });

  if (!rph) return; // Tidak ada jadwal, tidak perlu catat absen

  // 2. Cek apakah sudah ada absen untuk rencana produksi ini
  const existing = await prisma.attendance.findFirst({
    where: { rphId: rph.id },
  });

  if (!existing) {
    const [h, m] = rph.shift.jamMasuk.split(":");

    // Set jam masuk shift berdasarkan tanggal hari ini
    const shiftStartTime = new Date(now);
    shiftStartTime.setHours(parseInt(h), parseInt(m), 0, 0);

    // LOGIKA FITUR: Maksimal absen 2 jam sebelum jam shift
    const earliestAllowed = new Date(
      shiftStartTime.getTime() - 2 * 60 * 60 * 1000,
    );

    // Bypass check if explicitly requested (useful for load testing/admin)
    const isBypass = req?.headers && req.headers["x-bypass-attendance"] === "true";

    if (now < earliestAllowed && !isBypass) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Terlalu awal. Absen dibuka mulai jam ${earliestAllowed.toLocaleTimeString(
          "id-ID",
          { hour: "2-digit", minute: "2-digit" },
        )}`,
      );
    }

    // Tentukan status terlambat
    const isTerlambat = now > shiftStartTime;

    await prisma.attendance.create({
      data: {
        userId: user.id,
        rphId: rph.id,
        jamTap: now,
        tanggal: new Date(dateStr),
        isTerlambat: isTerlambat,
      },
    });

    // LOGIKA FITUR: Otomatis kurangi poin jika terlambat
    if (isTerlambat) {
      try {
        const tipeDisiplin = await prisma.tipeDisiplin.findUnique({
          where: { kode: "P01" },
        });

        if (tipeDisiplin) {
          // Cari admin untuk pencatatan sistem
          const adminStaff = await prisma.user.findFirst({
            where: { role: "ADMIN" },
            select: { id: true },
          });

          if (adminStaff) {
            await poinService.createPelanggaran(
              {
                operatorId: user.id,
                tipeDisiplinId: tipeDisiplin.id,
                shiftId: rph.shiftId,
                keterangan: `Sistem: Terlambat login pada ${now.toLocaleTimeString(
                  "id-ID",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )} (Shift: ${rph.shift.jamMasuk})`,
              },
              adminStaff.id,
            );
          }
        }
      } catch (error) {
        // Jangan block proses login jika pencatatan poin gagal, tapi log errornya
        console.error(
          "[ClockIn] Gagal mencatat poin disiplin otomatis:",
          error,
        );
      }
    }
  }
};

const updateAttendanceManual = async ({ rphId, userId, tanggal, action, adminId }) => {
  const rph = await prisma.rencanaProduksi.findUnique({
    where: { id: parseInt(rphId) },
    include: { shift: true }
  });

  if (!rph) {
    throw new ApiError(httpStatus.NOT_FOUND, "Rencana Produksi tidak ditemukan");
  }

  const existingAttendance = await prisma.attendance.findFirst({
    where: { rphId: rph.id, userId: parseInt(userId) },
  });

  if (action === "TIDAK_HADIR") {
    if (existingAttendance) {
      await prisma.attendance.delete({ where: { id: existingAttendance.id } });
    }
    return { success: true, message: "Kehadiran dihapus, status menjadi Tidak Hadir" };
  }

  const isTerlambat = action === "TERLAMBAT";
  let attendanceRecord;

  if (existingAttendance) {
    attendanceRecord = await prisma.attendance.update({
      where: { id: existingAttendance.id },
      data: { isTerlambat },
    });
  } else {
    // Determine the tap time for a manual present mark - lets use start of shift + a bit, or current time
    // Better to use current time or start of shift. Let's use current time.
    attendanceRecord = await prisma.attendance.create({
      data: {
        userId: parseInt(userId),
        rphId: rph.id,
        jamTap:nowWIB(),
        tanggal: new Date(tanggal),
        isTerlambat,
      },
    });
  }

  // Jika diset terlambat, otomatis potong point (jika belum dipotong)
  // Untuk menyederhanakan, kita hanya mencatat poin jika dibuat Manual
  if (isTerlambat && !existingAttendance?.isTerlambat) {
    try {
      const tipeDisiplin = await prisma.tipeDisiplin.findUnique({
        where: { kode: "P01" },
      });

      if (tipeDisiplin) {
        await poinService.createPelanggaran(
          {
            operatorId: parseInt(userId),
            tipeDisiplinId: tipeDisiplin.id,
            shiftId: rph.shiftId,
            keterangan: `Supervisor/Admin: Manual set terlambat`,
          },
          adminId,
        );
      }
    } catch (error) {
       console.error("[ManualAttendance] Gagal mencatat poin disiplin otomatis:", error);
    }
  }

  return attendanceRecord;
};

export default {
  getScheduledUsers,
  getPresentUsers,
  clockIn,
  updateAttendanceManual,
};
