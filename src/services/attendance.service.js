import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import poinService from "./poin.service.js";

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
    where.fk_id_shift = parseInt(shiftId);
  }

  if (divisiId) {
    where.user = {
      fk_id_divisi: parseInt(divisiId),
    };
  }

  const result = await prisma.rencanaProduksi.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          nama: true,
          uid_nfc: true,
          fk_id_divisi: true,
          divisi: true,
        },
      },
      mesin: true,
      produk: true,
      attendances: true,
    },
  });

  return result
    .filter((r) => r.user)
    .map((r) => {
      const attendance = r.attendances.length > 0 ? r.attendances[0] : null;

      return {
        nama: r.user.nama,
        status_absen: attendance ? "Hadir" : "Belum Hadir",
        is_terlambat: attendance ? attendance.is_terlambat : false,
        jam_tap: attendance ? attendance.jam_tap : null,
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
    where.rencana_produksi = {
      fk_id_shift: parseInt(shiftId),
    };
  }

  if (divisiId) {
    where.user = {
      fk_id_divisi: parseInt(divisiId),
    };
  }

  const result = await prisma.attendance.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          nama: true,
          uid_nfc: true,
          fk_id_divisi: true,
          divisi: true,
        },
      },
      rencana_produksi: {
        include: {
          mesin: true,
          shift: true,
        },
      },
    },
  });

  return result.map((a) => ({
    id: a.id,
    jam_tap: a.jam_tap,
    is_terlambat: a.is_terlambat,
    user: a.user,
    shift: a.rencana_produksi?.shift?.nama_shift,
    mesin: a.rencana_produksi?.mesin?.nama_mesin,
  }));
};

const clockIn = async (user, req) => {
  if (user.role !== "PRODUKSI") return;

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-CA"); // YYYY-MM-DD

  // 1. Cari RPH hari ini
  const rph = await prisma.rencanaProduksi.findFirst({
    where: {
      fk_id_user: user.id,
      tanggal: new Date(dateStr),
    },
    include: { shift: true },
  });

  if (!rph) return; // Tidak ada jadwal, tidak perlu catat absen

  // 2. Cek apakah sudah ada absen untuk rencana produksi ini
  const existing = await prisma.attendance.findFirst({
    where: { fk_id_rencana_produksi: rph.id },
  });

  if (!existing) {
    const [h, m] = rph.shift.jam_masuk.split(":");

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
    const is_terlambat = now > shiftStartTime;

    await prisma.attendance.create({
      data: {
        fk_id_user: user.id,
        fk_id_rencana_produksi: rph.id,
        jam_tap: now,
        tanggal: new Date(dateStr),
        is_terlambat,
      },
    });

    // LOGIKA FITUR: Otomatis kurangi poin jika terlambat
    if (is_terlambat) {
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
                fk_id_operator: user.id,
                fk_tipe_disiplin: tipeDisiplin.id,
                fk_id_shift: rph.fk_id_shift,
                keterangan: `Sistem: Terlambat login pada ${now.toLocaleTimeString(
                  "id-ID",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )} (Shift: ${rph.shift.jam_masuk})`,
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

export default {
  getScheduledUsers,
  getPresentUsers,
  clockIn,
};
