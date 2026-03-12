/**
 * k6/tests/scenario.js
 *
 * PRODUCTION SCENARIO TEST — Full lifecycle Andon + LRP.
 * Simulasi skenario nyata di lantai produksi:
 *
 *   Operator (PRODUKSI):
 *     Login → Input LRP → Trigger Andon → Cek andon aktif
 *
 *   Maintenance:
 *     Login → Ambil andon aktif → Start Repair → Resolve
 *
 *   Supervisor (dashboard watcher):
 *     Login → Polling OEE + Andon dashboard
 *
 * Jalankan:
 *   k6 run k6/tests/scenario.js
 *   k6 run --env BASE_URL=https://xxxx.ngrok.io k6/tests/scenario.js
 */
import http from "k6/http";
import { check, sleep, group } from "k6";
import { BASE_URL } from "../config.js";
import { login, authHeaders } from "../utils/auth.js";
import {
  USERS,
  MASTER,
  MASALAH_CAT,
  randomItem,
  randomLrpPayload,
  randomRphPayload,
  randomAndonTriggerPayload,
  randomAndonCallPayload,
  randomUnplannedMasalahId,
} from "../utils/data.js";

// Fix K6 Scenario Conflicts (400/409)
// - [x] Unify random generators to use specific IDs
// - [x] Implement unique VU assignment
// - [x] Add explicit RPH activation check
// - [x] Correct OEE/Dashboard URLs
// - [x] Add detailed error logging
// - [/] Implement Smart Machine Selection (Avoid busy machines)
// - [/] Implement global leftover cleanup (Andon & RPH)
// - [ ] Verify 100% Success Rate in Load Test
// - [ ] Document final test results in walkthrough.md

export const options = {
  scenarios: {
    // Skenario 1: Operator produksi input LRP & trigger Andon
    operator_flow: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "3s", target: 3 }, // Batasi 3 sesuai jumlah USERS.produksi
        { duration: "5s", target: 3 },
        { duration: "3s", target: 0 },
      ],
      exec: "operatorFlow",
      tags: { scenario: "operator" },
    },

    // Skenario 2: Maintenance start repair & resolve
    maintenance_flow: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "3s", target: 3 },
        { duration: "5s", target: 3 },
        { duration: "3s", target: 0 },
      ],
      exec: "maintenanceFlow",
      tags: { scenario: "maintenance" },
    },

    // Skenario 3: Supervisor polling dashboard
    dashboard_polling: {
      executor: "constant-vus",
      vus: 2,
      duration: "10s",
      exec: "supervisorFlow",
      tags: { scenario: "supervisor" },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"], // Toleransi sedikit lebih longgar untuk race condition
    "http_req_duration{scenario:operator}": ["p(95)<2000"],
    "http_req_duration{scenario:maintenance}": ["p(95)<2000"],
    "http_req_duration{scenario:supervisor}": ["p(95)<2000"],
  },
};

// ─── Skenario Operator ────────────────────────────────────────────────────
export function operatorFlow() {
  // 1. Login Supervisor untuk cek status global & create RPH
  const supToken = login(randomItem(USERS.supervisor)).token;
  const supHeaders = authHeaders(supToken);

  // --- SMART MACHINE SELECTION ---
  // Cari mesin yang benar-benar IDLE (tidak ada andon aktif)
  let machineId = null;
  const activeStatusRes = http.get(`${BASE_URL}/andon/active`, supHeaders);
  if (activeStatusRes.status === 200) {
      const activeData = JSON.parse(activeStatusRes.body).data;
      const busyMachineIds = [
          ...(activeData?.andonCalls || []).map(c => c.fk_id_mesin),
          ...(activeData?.andonEvents || []).map(e => e.fk_id_mesin)
      ];
      
      // Filter mesin yang sedang tidak sibuk
      const idleMachines = MASTER.mesinIds.filter(id => !busyMachineIds.includes(id));
      
      if (idleMachines.length > 0) {
          // Pilih mesin idle berdasarkan VU & Iterasi
          machineId = idleMachines[(__VU - 1 + (__ITER * 3)) % idleMachines.length];
      }
  }

  // Fallback jika tidak dapat data idle atau semua sibuk (pilih random based on VU)
  if (!machineId) {
      machineId = MASTER.mesinIds[(__VU - 1 + (__ITER * 10)) % MASTER.mesinIds.length];
  }

  const opIdx = (__VU - 1) % USERS.produksi.length;
  const opUidNfc = USERS.produksi[opIdx];
  
  // 2. Login Operator sebentar untuk ambil ID dan CLEANUP
  const opInit = login(opUidNfc);
  if (!opInit.user) return;
  const opId = opInit.user.id;
  const opHeaders = authHeaders(opInit.token);

  // 3. CLEANUP RPH: Jika mesin ini punya RPH ACTIVE (leftover), TUTUP DULU.
  const existingActiveRphId = opInit.dashboard?.produksi?.fk_id_rph;
  const existingMachineId = opInit.dashboard?.produksi?.fk_id_mesin;

  if (existingActiveRphId && (existingMachineId === machineId || !existingMachineId)) {
    group("operator: cleanup leftover RPH", function () {
      http.post(`${BASE_URL}/rencana-produksi/close-rph/${existingActiveRphId}`, null, opHeaders);
    });
    sleep(1);
  }

  // 4. Create RPH (PLANNED)
  let rphId = null;
  group("supervisor: create RPH", function () {
    const payload = JSON.stringify({
        ...randomRphPayload(opId),
        fk_id_mesin: machineId
    });
    const res = http.post(`${BASE_URL}/rencana-produksi`, payload, supHeaders);
    if (res.status === 201 || res.status === 200) {
        rphId = JSON.parse(res.body).data?.id;
    } else {
        console.warn(`[VU ${__VU}] Gagal create RPH di Mesin ${machineId}: ${res.status} - ${res.body}`);
    }
  });

  if (!rphId) return;

  // 5. Operator Login Ulang (Trigger Auto-Activation)
  const opAuth = login(opUidNfc);
  const activeOpHeaders = authHeaders(opAuth.token);
  
  const activeRphId = opAuth.dashboard?.produksi?.fk_id_rph;
  if (!activeRphId) {
      console.warn(`[VU ${__VU}] RPH ${rphId} gagal diaktivasi otomatis di Mesin ${machineId}.`);
      return;
  }

  // --- START REAL FLOW ---

  // Step 1: Call Andon (BREAKDOWN/UNPLANNED)
  group("operator: call andon", function () {
    const payload = JSON.stringify({
        fk_id_mesin: machineId,
        target_divisi: randomItem(["MAINTENANCE", "QUALITY"])
    });
    const res = http.post(`${BASE_URL}/andon/call`, payload, activeOpHeaders);
    const ok = check(res, { "[op/call] ok": (r) => r.status < 400 });
    if (!ok) console.error(`[op/call] FAILED (Machine ${machineId}): ${res.status} - ${res.body}`);
  });

  sleep(5); // Tunggu Maintenance Repair & Resolve

  // Step 2: Trigger Andon (PLAN_DOWNTIME)
  let plannedEventId = null;
  group("operator: trigger andon (plan)", function () {
    const payload = JSON.stringify({
        fk_id_mesin: machineId,
        fk_id_masalah: randomItem(MASALAH_CAT.plan_downtime) // <--- CRITICAL: Harus PLAN_DOWNTIME
    });
    const res = http.post(`${BASE_URL}/andon/trigger`, payload, opHeaders);
    const ok = check(res, { "[op/trigger] ok": (r) => r.status < 400 });
    if (ok) {
        plannedEventId = JSON.parse(res.body).data?.id;
    } else {
        console.error(`[op/trigger] FAILED: ${res.status} - ${res.body}`);
    }
  });

  sleep(2);

  // Step 3: Resolve Andon (Operator Resolve PLAN_DOWNTIME)
  if (plannedEventId) {
    group("operator: resolve andon (plan)", function () {
      const res = http.patch(`${BASE_URL}/andon/${plannedEventId}/resolve`, null, opHeaders);
      const ok = check(res, { "[op/resolve_plan] ok": (r) => r.status < 400 });
      if (!ok) console.error(`[op/resolve_plan] FAILED: ${res.status} - ${res.body}`);
    });
  }

  sleep(2);

  // --- FLOW 3: LRP ---
  group("operator: input LRP", function () {
    const payload = JSON.stringify(randomLrpPayload(opId, activeRphId));
    const res = http.post(`${BASE_URL}/lrp`, payload, opHeaders);
    const ok = check(res, { "[op/lrp] berhasil": (r) => r.status < 400 });
    if (!ok) console.error(`[op/lrp] FAILED: ${res.status} - ${res.body}`);
  });

  sleep(2);

  // --- FLOW 4: CLOSE RPH ---
  // Sangat penting agar iterasi berikutnya tidak menabrak RPH yang masih ACTIVE
  group("operator: close RPH", function () {
    const res = http.post(`${BASE_URL}/rencana-produksi/close-rph/${activeRphId}`, null, opHeaders);
    const ok = check(res, { "[op/close_rph] ok": (r) => r.status < 400 });
    if (!ok) console.error(`[op/close_rph] FAILED: ${res.status} - ${res.body}`);
  });

  sleep(2);
}

// ─── Skenario Maintenance ─────────────────────────────────────────────────
export function maintenanceFlow() {
  // Tambah jitter agar tidak barengan nyerang server
  sleep(Math.random() * 2);

  const maintIdx = (__VU - 1) % USERS.maintenance.length;
  const maintId = USERS.maintenance[maintIdx];
  const maintAuth = login(maintId);
  const headers = authHeaders(maintAuth.token);

  let targetCallId = null;
  let targetEventId = null;

  // Maintenance cuma fokus ke BREAKDOWN (Call)
  group("maintenance: scan for waiting calls", function () {
    const supAuth = login(randomItem(USERS.supervisor));
    const supHeaders = authHeaders(supAuth.token);

    const res = http.get(`${BASE_URL}/andon/active`, supHeaders);
    if (res.status === 200) {
      const body = JSON.parse(res.body);
      const calls = body.data?.andonCalls || [];
      const events = body.data?.andonEvents || [];

      // Gunakan VU ID untuk balancing agar tidak rebutan ID yang sama
      if (calls.length > 0) {
        const callPickIdx = (__VU) % calls.length;
        targetCallId = calls[callPickIdx].id;
      } 
      // Atau cari Event yang statusnya IN_REPAIR (milik manintenance)
      else if (events.length > 0) {
        const inRepair = events.find(e => e.status === "IN_REPAIR");
        if (inRepair) targetEventId = inRepair.id;
      }
    }
  });

  if (targetCallId) {
    group("maintenance: start repair (convert call)", function () {
      const payload = JSON.stringify({ fk_id_masalah: randomUnplannedMasalahId() });
      const res = http.patch(`${BASE_URL}/andon/${targetCallId}/start-repair`, payload, headers);
      check(res, { "[maint/start] ok": (r) => r.status < 400 });
      if (res.status < 400) {
          // Setelah start-repair, Call ID ini akan hilang dan jadi Event ID.
          // Kita asumsikan resolve akan dilakukan di loop berikutnya atau cari lagi.
      }
    });
  } else if (targetEventId) {
    group("maintenance: resolve breakdown", function () {
      const res = http.patch(`${BASE_URL}/andon/${targetEventId}/resolve`, null, headers);
      check(res, { "[maint/resolve] ok": (r) => r.status < 400 });
    });
  }

  sleep(3);
}

// ─── Skenario Supervisor Dashboard ────────────────────────────────────────
export function supervisorFlow() {
  const auth = login(randomItem(USERS.supervisor));
  const headers = authHeaders(auth.token);

  group("supervisor: poll dashboard", function () {
    const requests = {
      "oee_summary": `${BASE_URL}/oee/summary`,
      "oee_trend": `${BASE_URL}/oee/trend`,
      "andon_active": `${BASE_URL}/andon/active`,
      "andon_history": `${BASE_URL}/andon/history?limit=10`,
    };
    
    for (const name in requests) {
      const res = http.get(requests[name], headers);
      const ok = check(res, { [`[sup/${name}] ok`]: (r) => r.status === 200 });
      if (!ok) {
        console.error(`[sup/${name}] FAILED: ${res.status} - ${res.body}`);
      }
    }
  });

  sleep(1);
}
