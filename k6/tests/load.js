/**
 * k6/tests/load.js
 *
 * LOAD TEST — Simulasi beban nyata harian.
 * Ramp up → steady → ramp down
 * Target: 50 VUs selama 3 menit
 *
 * Jalankan:
 *   k6 run k6/tests/load.js
 *   k6 run --env BASE_URL=https://xxxx.ngrok.io k6/tests/load.js
 */
import http from "k6/http";
import { check, sleep, group } from "k6";
import { BASE_URL } from "../config.js";
import { login, authHeaders } from "../utils/auth.js";
import {
  USERS,
  randomItem,
  randomLrpPayload,
} from "../utils/data.js";

export const options = {
  stages: [
    { duration: "30s", target: 20 },   // Ramp up → 20 VU
    { duration: "1m", target: 50 },    // Steady state 50 VU
    { duration: "30s", target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<800"],  // 95% harus < 800ms
    http_req_failed: ["rate<0.02"],    // Error < 2%
    "http_req_duration{endpoint:login}": ["p(95)<500"],
    "http_req_duration{endpoint:lrp_post}": ["p(95)<1000"],
    "http_req_duration{endpoint:oee_summary}": ["p(95)<1500"],
  },
};

export default function () {
  const opUidNfc = randomItem(USERS.produksi);

  // 1. Supervisor creates RPH
  const supAuth = login(randomItem(USERS.supervisor));
  const supHeaders = authHeaders(supAuth.token);

  // 2. Get Operator ID
  const opInit = login(opUidNfc);
  const opId = opInit.user.id;

  // 3. Create RPH via Supervisor
  let rphId = null;
  const rphRes = http.post(`${BASE_URL}/rencana-produksi`, JSON.stringify(randomRphPayload(opId)), supHeaders);
  if (rphRes.status === 201 || rphRes.status === 200) {
    rphId = JSON.parse(rphRes.body).data.id;
  }

  if (!rphId) return;

  // 4. Activate RPH via Operator login
  const opAuth = login(opUidNfc);
  const opHeaders = authHeaders(opAuth.token);
  const activeRphId = opAuth.dashboard?.produksi?.fk_id_rph || rphId;

  // ── Group 1: Input LRP (operator produksi) ──────────────────────────────
  group("Input LRP", function () {
    const payload = JSON.stringify(randomLrpPayload(opId, activeRphId));
    const res = http.post(`${BASE_URL}/lrp`, payload, {
      ...opHeaders,
      tags: { endpoint: "lrp_post" },
    });
    check(res, {
      "[lrp] status 201 atau 200": (r) => r.status === 201 || r.status === 200,
    });
  });

  sleep(Math.random() * 2 + 1);

  // ── Group 2: Baca Andon my-active (personal) ────────────────────────────
  group("Cek Andon My Active", function () {
    const res = http.get(`${BASE_URL}/andon/my-active`, {
      ...opHeaders,
      tags: { endpoint: "andon_my_active" },
    });
    check(res, {
      "[andon/my-active] status 200": (r) => r.status === 200,
    });
  });

  sleep(1);

  // ── Group 3: OEE Summary (supervisor / admin) ───────────────────────────
  group("OEE Summary", function () {
    const sAuth = login(randomItem(USERS.supervisor));
    const sHeaders = authHeaders(sAuth.token);

    const res = http.get(`${BASE_URL}/oee/summary`, {
      ...sHeaders,
      tags: { endpoint: "oee_summary" },
    });
    check(res, {
      "[oee/summary] status 200": (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 2 + 1);
}
