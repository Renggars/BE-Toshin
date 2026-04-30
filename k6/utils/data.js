/**
 * k6/utils/data.js
 * Minimal test data for authentication tests.
 */

// Daftar UID NFC yang valid dari database (berdasarkan hasil seed default)
export const TEST_USERS = [
  "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"
];

/**
 * Helper: Pilih random dari array
 */
export function randomItem(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
