/**
 * k6/tests/load.js
 * LOAD TEST — Fokus pada performa Login dengan beban bertahap.
 */
import { sleep } from "k6";
import { login } from "../utils/auth.js";
import { TEST_USERS, randomItem } from "../utils/data.js";

// Load Test Configuration (Berdasarkan contoh user)
export const options = {
  stages: [
    { duration: "5s", target: 50 }, // ramp up to 50 VUs
    { duration: "15s", target: 50 }, // hold 50 VUs
    { duration: "10s", target: 0 },  // ramp down to 0 VUs
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests must be under 500ms
    http_req_failed: ["rate<0.01"],   // error rate must be under 1%
  },
};

export default function () {
  // Ambil user acak dari list minimal
  const user = randomItem(TEST_USERS);
  
  // Test Auth
  login(user);

  sleep(1);
}
