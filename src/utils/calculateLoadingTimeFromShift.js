// src/utils/calculateLoadingTimeFromShift.js

/**
 * Hitung Loading Time dari master Shift
 * @param {Object} shift
 * @returns {number} loading time (menit)
 */
const calculateLoadingTimeFromShift = (shift) => {
  const [startH, startM] = shift.jamMasuk.split(":").map(Number);
  const [endH, endM] = shift.jamKeluar.split(":").map(Number);

  let shiftMinutes = endH * 60 + endM - (startH * 60 + startM);

  // Handle shift malam
  if (shiftMinutes < 0) {
    shiftMinutes += 24 * 60;
  }

  // Kurangi istirahat utama
  const effectiveWorkTime = shiftMinutes - (shift.breakDuration || 0);

  // Toleransi toilet (% dari waktu kerja efektif)
  const toiletTolerance = effectiveWorkTime * (shift.toiletTolerancePct || 0);

  // Loading Time final
  const loadingTime =
    effectiveWorkTime -
    (shift.cleaningDuration || 0) -
    (shift.briefingDuration || 0) -
    toiletTolerance;

  return Math.max(0, Number(loadingTime.toFixed(2)));
};

export default calculateLoadingTimeFromShift;
