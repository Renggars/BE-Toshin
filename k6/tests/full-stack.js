/**
 * k6/tests/full-stack.js
 * INTEGRATION STRESS TEST — Mengetes seluruh stack:
 * Auth, Andon (BullMQ), LRP (Redis + BullMQ), Sockets (Metrics).
 */
import { sleep, group } from "k6";
import { login } from "../utils/auth.js";
import { TEST_USERS, randomItem } from "../utils/data.js";
import { getAndonMaster, triggerAndon, upsertLrp } from "../utils/business.js";

export const options = {
  stages: [
    { duration: "10s", target: 20 }, // Simulasikan 20 user masuk bersamaan
    { duration: "20s", target: 50 }, // Naik ke 50 user
    { duration: "10s", target: 0 },  // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<1000"], // Latency P95 harus di bawah 1 detik
    http_req_failed: ["rate<0.05"],   // Toleransi error 5% saat stress test
  },
};

export default function () {
  const userId = randomItem(TEST_USERS);
  
  group("Step 1: Authenticaton", () => {
    const loginRes = login(userId);
    if (!loginRes || !loginRes.token) return;

    const token = loginRes.token;

    group("Step 2: Business Logic (Andon & BullMQ)", () => {
      // 1. Ambil Data Master (Mesin & Masalah)
      const masterData = getAndonMaster(token);
      if (!masterData || masterData.machines.length === 0) return;

      const mesin = randomItem(masterData.machines);
      const masalah = randomItem(masterData.problems);

      // 2. Trigger Andon (Ini akan membuat BullMQ Job)
      triggerAndon(token, {
        mesinId: mesin.id,
        masalahId: masalah.id,
        operatorId: loginRes.user.id
      });

      sleep(1);

      // 3. Upsert LRP (Ini akan mentrigger OEE Recalc via BullMQ & Redis)
      // Kita asumsikan ada RPH ID untuk mesin ini (untuk test kita pakai random ID kecil)
      const mockRphId = Math.floor(Math.random() * 10) + 1; 
      upsertLrp(token, mockRphId);
    });
  });

  sleep(Math.random() * 3 + 1); // Random wait antara 1-4 detik
}
