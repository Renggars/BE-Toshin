// src/utils/calculateOeeMetrics.js

/**
 * Calculate OEE Metrics
 * @param {Object} data
 * @param {Array} logs
 * @returns {Object}
 */
const calculateOeeMetrics = (data, logs) => {
  let downtime = 0;

  logs.forEach((log) => {
    const durasi = Number(log.durasi_menit || 0);

    if (
      log.kategori_downtime === "PLAN_DOWNTIME" ||
      log.kategori_downtime === "BREAKDOWN"
    ) {
      downtime += durasi;
    }
  });

  const loading_time = data.loading_time;
  const operating_time = Math.max(0, loading_time - downtime);

  // ===== Availability =====
  const availability =
    loading_time > 0 ? (operating_time / loading_time) * 100 : 0;

  // ===== Performance =====
  // (Output × CycleTime) / OperatingTime (both in minutes)
  const performance =
    operating_time > 0
      ? ((data.qty_total * data.cycle_time) / operating_time) * 100
      : 0;


  // ===== Quality =====
  const quality = data.qty_total > 0 ? (data.qty_ok / data.qty_total) * 100 : 0;

  // ===== OEE =====
  const oee =
    (availability / 100) * (performance / 100) * (quality / 100) * 100;

  return {
    availability: +availability.toFixed(2),
    performance: +performance.toFixed(2),
    quality: +quality.toFixed(2),
    oee_score: +oee.toFixed(2),
    downtime,
    operating_time,
  };
};

export default calculateOeeMetrics;
