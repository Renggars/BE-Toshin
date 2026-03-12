/**
 * k6 Global Config
 * Ganti BASE_URL dengan URL backend kamu (lokal / ngrok / server).
 */
export const BASE_URL = __ENV.BASE_URL || "http://localhost:4002";

// Threshold default yang dipakai semua test
export const DEFAULT_THRESHOLDS = {
  // 95% request harus selesai < 1 detik
  http_req_duration: ["p(95)<1000"],
  // Error rate tidak boleh > 1%
  http_req_failed: ["rate<0.01"],
};
