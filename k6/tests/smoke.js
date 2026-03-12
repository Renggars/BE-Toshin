/**
 * k6/tests/smoke.js
 *
 * SMOKE TEST — Validasi bahwa script berjalan dan sistem bisa merespons.
 * VUs: 2 | Duration: 30 detik
 *
 * Jalankan:
 *   k6 run k6/tests/smoke.js
 *   k6 run --env BASE_URL=https://xxxx.ngrok.io k6/tests/smoke.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { DEFAULT_THRESHOLDS, BASE_URL } from "../config.js";
import { login, authHeaders } from "../utils/auth.js";
import { USERS } from "../utils/data.js";

export const options = {
  vus: 2,
  duration: "10s",
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  // 1. Login sebagai operator produksi
  const opAuth = login(USERS.produksi[0]);
  const headers = authHeaders(opAuth.token);

  // 2. Cek endpoint OEE Summary
  const oeeRes = http.get(`${BASE_URL}/oee/summary`, headers);
  check(oeeRes, {
    "[smoke/oee] status 200": (r) => r.status === 200,
  });

  sleep(1);

  // 3. Cek Andon Active (pakai supervisor)
  const supAuth = login(USERS.supervisor[0]);
  const supHeaders = authHeaders(supAuth.token);

  const andonRes = http.get(`${BASE_URL}/andon/active`, supHeaders);
  check(andonRes, {
    "[smoke/andon] status 200": (r) => r.status === 200,
  });

  sleep(1);
}
