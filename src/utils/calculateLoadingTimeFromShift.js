// src/utils/calculateLoadingTimeFromShift.js

/**
 * Hitung Loading Time dari master Shift
 * @param {Object} shift
 * @returns {number} loading time (menit)
 */
const calculateLoadingTimeFromShift = (shift) => {
  const [startH, startM] = shift.jam_masuk.split(":").map(Number);
  const [endH, endM] = shift.jam_keluar.split(":").map(Number);

  let shiftMinutes = endH * 60 + endM - (startH * 60 + startM);

  // Handle shift malam
  if (shiftMinutes < 0) {
    shiftMinutes += 24 * 60;
  }

  // Kurangi istirahat utama
  const effectiveWorkTime = shiftMinutes - (shift.break_duration || 0);

  // Toleransi toilet (% dari waktu kerja efektif)
  const toiletTolerance = effectiveWorkTime * (shift.toilet_tolerance_pct || 0);

  // Loading Time final
  const loadingTime =
    effectiveWorkTime -
    (shift.cleaning_duration || 0) -
    (shift.briefing_duration || 0) -
    toiletTolerance;

  return Math.max(0, Number(loadingTime.toFixed(2)));
};

export default calculateLoadingTimeFromShift;
