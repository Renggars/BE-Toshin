import http from "k6/http";
import { group, sleep, check } from "k6";
import { login } from "../utils/auth.js";
import { BASE_URL } from "../config.js";

// Stress test options for Redis Caching
export const options = {
  stages: [
    { duration: "10s", target: 50 }, // Ramp up to 50 concurrent hits
    { duration: "20s", target: 50 }, // Maintain load
    { duration: "10s", target: 0 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<200"], // Redis should keep response times very low
  },
};

export default function () {
  // 1. Login sebagai Admin (UID NFC 2)
  const loginRes = login("2");
  if (!loginRes || !loginRes.token) {
    sleep(1);
    return;
  }
  const token = loginRes.token;

  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  group("Master Data - Redis Cache Stress", () => {
    // List of master endpoints that use Redis
    const endpoints = [
      "/master/mesin",
      "/master/produk",
      "/master/shift",
      "/master/masalah-andon",
      "/master/all",
      "/master/line",
      "/master/tipe-disiplin"
    ];

    endpoints.forEach((path) => {
      const res = http.get(`${BASE_URL}${path}`, params);
      
      check(res, {
        [`success ${path}`]: (r) => r.status === 200,
      });

      // Sedikit jeda antar request dalam satu iteration
      sleep(0.1); 
    });
  });

  // Jeda antar iteration
  sleep(1);
}
