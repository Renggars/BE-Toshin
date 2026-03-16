import prisma from "../../prisma/index.js";
import { calculateProductionTarget } from "../utils/productionCalc.js";
import redis from "../utils/redis.js";
import logger from "../config/logger.js";

const MASTER_CACHE_KEY = "master_data_all";
const MESIN_CACHE_KEY = "master_mesin_grouped";
const PRODUK_CACHE_KEY = "master_produk_all";
const SHIFT_CACHE_KEY = "master_shift_all";
const MASALAH_ANDON_CACHE_KEY = "master_masalah_andon_all";
const TIPE_DISIPLIN_CACHE_KEY = "master_tipe_disiplin_all";
const TARGET_CACHE_PREFIX = "master_target:";
const JENIS_PEKERJAAN_CACHE_KEY = "master_jenis_pekerjaan_all";

const invalidateMasterCache = async () => {
  try {
    logger.info("[Redis] Invalidating Master Data Caches...");
    await Promise.all([
      redis.del(MASTER_CACHE_KEY),
      redis.del(MESIN_CACHE_KEY),
      redis.del(PRODUK_CACHE_KEY),
      redis.del(SHIFT_CACHE_KEY),
      redis.del(MASALAH_ANDON_CACHE_KEY),
      redis.del(TIPE_DISIPLIN_CACHE_KEY),
      redis.del(JENIS_PEKERJAAN_CACHE_KEY),
      redis.delByPattern(`${TARGET_CACHE_PREFIX}*`),
    ]);
  } catch (err) {
    logger.error(`[Redis] Cache invalidation failed: ${err.message}`);
  }
};

// --- Mesin ---
const getMesin = async () => {
  // Check Cache First
  const cachedData = await redis.get(MESIN_CACHE_KEY);
  if (cachedData) {
    const categories = Object.keys(cachedData);
    const count = categories.reduce(
      (sum, cat) => sum + cachedData[cat].length,
      0,
    );
    logger.info(
      `[Redis] Cache HIT: Serving Machines Data from Redis. Summary: ${count} machines in ${categories.length
      } categories (${categories.join(", ")})`,
    );
    return cachedData;
  }

  logger.info("[Redis] Cache MISS: Fetching Machines Data from Database...");
  const allMesin = await prisma.mesin.findMany();

  // Group by kategori secara dinamis
  const result = allMesin.reduce((acc, mesin) => {
    const key = mesin.kategori.toLowerCase();
    if (!acc[key]) acc[key] = [];
    acc[key].push(mesin);
    return acc;
  }, {});

  // Set Cache
  await redis.set(MESIN_CACHE_KEY, result, 3600); // Cache for 1 hour
  logger.info("[Redis] Cache SET: Machines Data cached successfully");

  return result;
};

const createMesin = async (data) => {
  const res = await prisma.mesin.create({ data });
  await invalidateMasterCache();
  return res;
};

const updateMesin = async (id, data) => {
  const res = await prisma.mesin.update({ where: { id }, data });
  await invalidateMasterCache();
  return res;
};

const deleteMesin = async (id) => {
  const res = await prisma.mesin.delete({ where: { id } });
  await invalidateMasterCache();
  return res;
};

// --- Produk ---
const getProduk = async () => {
  // Check Cache First
  const cachedData = await redis.get(PRODUK_CACHE_KEY);
  if (cachedData) {
    logger.info(
      `[Redis] Cache HIT: Serving Products Data from Redis. Summary: ${cachedData.length} products`,
    );
    return cachedData;
  }

  logger.info("[Redis] Cache MISS: Fetching Products Data from Database...");
  const result = await prisma.produk.findMany();

  // Set Cache
  await redis.set(PRODUK_CACHE_KEY, result, 3600); // Cache for 1 hour
  logger.info("[Redis] Cache SET: Products Data cached successfully");

  return result;
};

const createProduk = async (data) => {
  const res = await prisma.produk.create({ data });
  await invalidateMasterCache();
  return res;
};

const updateProduk = async (id, data) => {
  const res = await prisma.produk.update({ where: { id }, data });
  await invalidateMasterCache();
  return res;
};

const deleteProduk = async (id) => {
  const res = await prisma.produk.delete({ where: { id } });
  await invalidateMasterCache();
  return res;
};

// --- Jenis Pekerjaan ---
const getJenisPekerjaan = async () => {
  // Check Cache First
  const cachedData = await redis.get(JENIS_PEKERJAAN_CACHE_KEY);
  if (cachedData) {
    logger.info(
      `[Redis] Cache HIT: Serving Jenis Pekerjaan Data from Redis. Summary: ${cachedData.length} items`,
    );
    return cachedData;
  }

  logger.info(
    "[Redis] Cache MISS: Fetching Jenis Pekerjaan Data from Database...",
  );
  const result = await prisma.jenisPekerjaan.findMany();

  // Set Cache
  await redis.set(JENIS_PEKERJAAN_CACHE_KEY, result, 3600);
  logger.info("[Redis] Cache SET: Jenis Pekerjaan Data cached successfully");

  return result;
};

const createJenisPekerjaan = async (data) => {
  const res = await prisma.jenisPekerjaan.create({ data });
  await invalidateMasterCache();
  return res;
};

// --- Shift ---
const getShift = async () => {
  // Check Cache First
  const cachedData = await redis.get(SHIFT_CACHE_KEY);
  if (cachedData) {
    logger.info(
      `[Redis] Cache HIT: Serving Shift Data from Redis. Summary: ${cachedData.length} shifts`,
    );
    return cachedData;
  }

  logger.info("[Redis] Cache MISS: Fetching Shift Data from Database...");
  const result = await prisma.shift.findMany();

  // Set Cache
  await redis.set(SHIFT_CACHE_KEY, result, 3600); // Cache for 1 hour
  logger.info("[Redis] Cache SET: Shift Data cached successfully");

  return result;
};

const createShift = async (data) => {
  const res = await prisma.shift.create({ data });
  await invalidateMasterCache();
  return res;
};

const updateShift = async (id, data) => {
  const res = await prisma.shift.update({ where: { id }, data });
  await invalidateMasterCache();
  return res;
};

const deleteShift = async (id) => {
  const res = await prisma.shift.delete({ where: { id } });
  await invalidateMasterCache();
  return res;
};

// --- Target ---
const getTarget = async (filter, shiftId) => {
  // Check Cache First
  const cacheKey = `${TARGET_CACHE_PREFIX}${JSON.stringify(filter)}:${shiftId || "none"
    }`;
  const cachedData = await redis.get(cacheKey);
  if (cachedData) {
    logger.info(
      `[Redis] Cache HIT: Serving Target Data from Redis. Key matches filter: ${JSON.stringify(
        filter,
      )}`,
    );
    return cachedData;
  }

  logger.info("[Redis] Cache MISS: Fetching Target Data from Database...");
  // 1. Ambil data dari database dengan relasi
  const include = { jenis_pekerjaan: true, produk: true };
  const targetData =
    filter.fk_produk && filter.fk_jenis_pekerjaan
      ? await prisma.target.findFirst({ where: filter, include })
      : await prisma.target.findMany({ where: filter, include });

  if (!targetData) return targetData;

  // 2. Ambil data shift jika ada shiftId
  const shift = shiftId
    ? await prisma.shift.findUnique({ where: { id: shiftId } })
    : null;

  // 3. Function helper untuk formatting
  const formatTarget = (t) => {
    const formatted = {
      ...t,
      nama_pekerjaan: t.jenis_pekerjaan?.nama_pekerjaan,
      nama_produk: t.produk?.nama_produk,
    };

    // Hapus objek relasi agar response bersih
    delete formatted.jenis_pekerjaan;
    delete formatted.produk;

    // Hitung kalkulasi target jika data shift tersedia
    if (shift) {
      Object.assign(
        formatted,
        calculateProductionTarget(t.total_target, shift.tipe_shift),
      );
    }

    return formatted;
  };

  // 4. Return formatted data
  let result;
  if (Array.isArray(targetData)) {
    result = targetData.map(formatTarget);
  } else {
    result = formatTarget(targetData);
  }

  // Set Cache
  await redis.set(cacheKey, result, 3600);
  logger.info("[Redis] Cache SET: Target Data cached successfully");

  return result;
};

const createTarget = async (data) => {
  const res = await prisma.target.create({ data });
  await invalidateMasterCache();
  return res;
};

const updateTarget = async (id, data) => {
  const res = await prisma.target.update({ where: { id }, data });
  await invalidateMasterCache();
  return res;
};

const deleteTarget = async (id) => {
  const res = await prisma.target.delete({ where: { id } });
  await invalidateMasterCache();
  return res;
};

// --- Masalah Andon ---
const getMasalahAndon = async () => {
  // Check Cache First
  const cachedData = await redis.get(MASALAH_ANDON_CACHE_KEY);
  if (cachedData) {
    logger.info(
      `[Redis] Cache HIT: Serving Masalah Andon Data from Redis. Summary: ${cachedData.length} problems`,
    );
    return cachedData;
  }

  logger.info(
    "[Redis] Cache MISS: Fetching Masalah Andon Data from Database...",
  );
  const result = await prisma.masterMasalahAndon.findMany();

  // Set Cache
  await redis.set(MASALAH_ANDON_CACHE_KEY, result, 3600);
  logger.info("[Redis] Cache SET: Masalah Andon Data cached successfully");

  return result;
};

const createMasalahAndon = async (data) => {
  const res = await prisma.masterMasalahAndon.create({ data });
  await invalidateMasterCache();
  return res;
};

const updateMasalahAndon = async (id, data) => {
  const res = await prisma.masterMasalahAndon.update({ where: { id }, data });
  await invalidateMasterCache();
  return res;
};

const deleteMasalahAndon = async (id) => {
  const res = await prisma.masterMasalahAndon.delete({ where: { id } });
  await invalidateMasterCache();
  return res;
};

// --- Aggregated Master Data ---
const getAllMasterData = async () => {
  // Check Cache First
  const cachedData = await redis.get(MASTER_CACHE_KEY);
  if (cachedData) {
    const summary = `Shift: ${cachedData.shift?.length || 0}, Mesin: ${Object.keys(cachedData.mesin || {}).length
      } cats, Produk: ${cachedData.produk?.length || 0}, JenisPekerjaan: ${cachedData.jenisPekerjaan?.length || 0
      }`;
    logger.info(
      `[Redis] Cache HIT: Serving Master Data from Redis. Summary: ${summary}`,
    );
    return cachedData;
  }

  logger.info("[Redis] Cache MISS: Fetching Master Data from Database...");
  const [shift, mesin, jenisPekerjaan, produk] = await Promise.all([
    getShift(),
    getMesin(),
    getJenisPekerjaan(),
    getProduk(),
  ]);

  const result = {
    shift,
    mesin,
    jenisPekerjaan,
    produk,
  };

  // Set Cache
  await redis.set(MASTER_CACHE_KEY, result, 3600); // Cache for 1 hour
  logger.info("[Redis] Cache SET: Master Data cached successfully");

  return result;
};

// --- Tipe Disiplin ---
const getTipeDisiplin = async () => {
  // Check Cache First
  const cachedData = await redis.get(TIPE_DISIPLIN_CACHE_KEY);
  if (cachedData) {
    const total =
      (cachedData.pelanggaran?.length || 0) +
      (cachedData.penghargaan?.length || 0);
    logger.info(
      `[Redis] Cache HIT: Serving Tipe Disiplin Data from Redis. Summary: ${total} items`,
    );
    return cachedData;
  }

  logger.info(
    "[Redis] Cache MISS: Fetching Tipe Disiplin Data from Database...",
  );
  const [pelanggaran, penghargaan] = await Promise.all([
    prisma.tipeDisiplin.findMany({
      where: { kategori: "PELANGGARAN" },
    }),
    prisma.tipeDisiplin.findMany({
      where: { kategori: "PENGHARGAAN" },
    }),
  ]);

  const result = {
    pelanggaran,
    penghargaan,
  };

  // Set Cache
  await redis.set(TIPE_DISIPLIN_CACHE_KEY, result, 3600);
  logger.info("[Redis] Cache SET: Tipe Disiplin Data cached successfully");

  return result;
};

const createTipeDisiplin = async (data) => {
  const res = await prisma.tipeDisiplin.create({ data });
  await invalidateMasterCache();
  return res;
};

const updateTipeDisiplin = async (id, data) => {
  const res = await prisma.tipeDisiplin.update({ where: { id }, data });
  await invalidateMasterCache();
  return res;
};

const deleteTipeDisiplin = async (id) => {
  const res = await prisma.tipeDisiplin.delete({ where: { id } });
  await invalidateMasterCache();
  return res;
};

export default {
  // Mesin
  getMesin,
  createMesin,
  updateMesin,
  deleteMesin,
  // Produk
  getProduk,
  createProduk,
  updateProduk,
  deleteProduk,
  // Shift
  getShift,
  createShift,
  updateShift,
  deleteShift,
  // Target
  getTarget,
  createTarget,
  updateTarget,
  deleteTarget,
  // Masalah Andon
  getMasalahAndon,
  createMasalahAndon,
  updateMasalahAndon,
  deleteMasalahAndon,
  // Jenis Pekerjaan
  getJenisPekerjaan,
  createJenisPekerjaan,
  // Tipe Disiplin
  getTipeDisiplin,
  createTipeDisiplin,
  updateTipeDisiplin,
  deleteTipeDisiplin,
  // Aggregated
  getAllMasterData,
};
