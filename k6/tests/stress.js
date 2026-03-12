/**
 * k6/tests/stress.js
 *
 * STRESS TEST — Cari breaking point sistem.
 * VU naik terus sampai 200, lalu turun tiba-tiba.
 * Fokus: endpoint PALING BERAT (OEE dashboard + Andon dashboard)
 *
 * Jalankan:
 *   k6 run k6/tests/stress.js
 *   k6 run --env BASE_URL=https://xxxx.ngrok.io k6/tests/stress.js
 *
 * ⚠️  Hati-hati jalankan di production! Gunakan di staging/dev dulu.
 */
import http from "k6/http";
import { check, sleep, group } from "k6";
import { BASE_URL } from "../config.js";
import { login, authHeaders } from "../utils/auth.js";
import { USERS, randomItem } from "../utils/data.js";

export const options = {
  stages: [
    { duration: "30s", target: 30 },    // Ramp up ke 30 VU
    { duration: "1m", target: 80 },     // Push ke 80 VU
    { duration: "1m", target: 150 },    // Stress: 150 VU
    { duration: "30s", target: 200 },   // Breaking point: 200 VU
    { duration: "30s", target: 0 },     // Ramp down cepat
  ],
  thresholds: {
    // Threshold lebih longgar untuk stress test
    http_req_duration: ["p(95)<3000"],  // Boleh hingga 3 detik
    http_req_failed: ["rate<0.05"],     // Error rate max 5%
  },
};

export default function () {
  const pool = USERS.supervisor.length > 0 ? USERS.supervisor : USERS.admin;
  const supAuth = login(randomItem(pool));
  const headers = authHeaders(supAuth.token);

  // ── Endpoint paling berat: OEE Dashboard ────────────────────────────────
  group("OEE Summary (heavy)", function () {
    const res = http.get(`${BASE_URL}/oee/summary`, headers);
    check(res, { "[stress/oee] merespons": (r) => r.status < 500 });
  });

  sleep(0.5);

  group("OEE Trend (heavy)", function () {
    const res = http.get(`${BASE_URL}/oee/trend`, headers);
    check(res, { "[stress/oee/trend] merespons": (r) => r.status < 500 });
  });

  sleep(0.5);

  group("Andon Dashboard (heavy)", function () {
    const res = http.get(`${BASE_URL}/andon/dashboard`, headers);
    check(res, { "[stress/andon/dash] merespons": (r) => r.status < 500 });
  });

  sleep(0.5);

  // ── Simulasi Concurrent Login ──────────────────────────────────────────
  group("Auth Login (concurrent)", function () {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ uid_nfc: randomItem(USERS.produksi) }),
      { headers: { "Content-Type": "application/json" } }
    );
    check(res, {
      "[stress/login] status 200": (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 1 + 0.5);
}
