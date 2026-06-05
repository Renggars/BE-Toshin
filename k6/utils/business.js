import http from "k6/http";
import { check, sleep } from "k6";
import { randomItem } from "./data.js";
import { login } from "./auth.js";
import { BASE_URL } from "../config.js";

/**
 * Helper: Ambil data master untuk andon (mesin, masalah, dll)
 * Kita butuh ini agar data yang dikirim ke /trigger valid.
 */
export function getAndonMaster(token) {
  const params = {
    headers: { Authorization: `Bearer ${token}` },
  };
  const res = http.get(`${BASE_URL}/andon/trigger-master`, params);
  
  if (res.status === 200) {
    return res.json().data;
  }
  return null;
}

/**
 * Trigger Andon (Stress BullMQ / Task Metrics)
 */
export function triggerAndon(token, data) {
  const params = {
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
  };

  const payload = JSON.stringify({
    mesinId: data.mesinId,
    masalahId: data.masalahId,
    operatorId: data.operatorId
  });

  const res = http.post(`${BASE_URL}/andon/trigger`, payload, params);
  
  check(res, {
    "andon triggered": (r) => r.status === 201 || r.status === 409 || r.status === 400,
  });

  return res.status;
}

/**
 * Upsert LRP (Stress Redis / BullMQ OEE)
 */
export function upsertLrp(token, rphId) {
  const params = {
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
  };

  const payload = JSON.stringify({
    noKanagata: "TEST-KANA-001",
    noLot: "LOT-999",
    qtyOk: Math.floor(Math.random() * 100),
    qtyNgProses: 2,
    counterStart: 100,
    counterEnd: 200
  });

  const res = http.post(`${BASE_URL}/lrp/${rphId}`, payload, params);
  
  check(res, {
    "lrp upserted": (r) => r.status === 200 || r.status === 201 || r.status === 400,
  });

  return res.status;
}
