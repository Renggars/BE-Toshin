// utils/productionCalc.js

/**
 * Menghitung target lembur dan total target berdasarkan tipe shift
 * @param {number} targetNormal - Target dasar dari master data
 * @param {string} tipeShift - Tipe shift (e.g., 'Long Shift', 'Group', 'Normal')
 * @returns {object} - Objek berisi target_normal, target_lembur, dan total_target
 */
export const calculateProductionTarget = (targetNormal, tipeShift) => {
  let targetLembur = 0;
  let totalTarget = targetNormal;

  switch (tipeShift) {
    case "Long Shift":
      totalTarget = Math.round(targetNormal * 1.3);
      targetLembur = totalTarget - targetNormal;
      break;
    case "Group":
      totalTarget = Math.round(targetNormal * 1.15);
      targetLembur = totalTarget - targetNormal;
      break;
    default:
      totalTarget = targetNormal;
      targetLembur = 0;
  }

  return {
    target_normal: targetNormal,
    target_lembur: targetLembur,
    total_target: totalTarget,
  };
};
