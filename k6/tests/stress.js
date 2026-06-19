/**
 * k6/tests/stress.js
 * STRESS TEST — Menguji batas maksimal sistem dalam menangani Login.
 */
import { sleep } from "k6";
import { login } from "../utils/auth.js";
import { TEST_USERS, randomItem } from "../utils/data.js";

// Stress Test Configuration
export const options = {
  stages: [
    { duration: "5s", target: 50 },  // Tahap awal
    { duration: "15s", target: 100 }, // Naikkan beban
    { duration: "20s", target: 200 }, // Beban puncak (Stress)
    { duration: "10s", target: 0 },   // Selesai
  ],
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    http_req_failed: ["rate<0.05"],   // Toleransi error sedikit lebih tinggi saat stress
  },
};

export default function () {
  const user = randomItem(TEST_USERS);
  
  login(user);

  sleep(0.5); // Lebih cepat dari load test
}
