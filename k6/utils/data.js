/**
 * k6/utils/data.js
 * Test data untuk digunakan di semua skenario.
 *
 * ⚠️  SESUAIKAN nilai-nilai di bawah ini dengan data yang ADA di database kamu!
 *    Jalankan query berikut untuk mendapatkan ID yang valid:
 *
 *    SELECT id FROM users WHERE role = 'PRODUKSI' LIMIT 5;
 *    SELECT id FROM users WHERE role = 'MAINTENANCE' LIMIT 3;
 *    SELECT id FROM users WHERE role = 'SUPERVISOR' LIMIT 2;
 *    SELECT id FROM mesin LIMIT 5;
 *    SELECT id FROM masalah LIMIT 5;
 *    SELECT id FROM shift LIMIT 3;
 *    SELECT id FROM rph WHERE status = 'ACTIVE' LIMIT 5;
 */

// ─── UID NFC per role ─────────────────────────────────────────────────────
// ⚠️  Ganti dengan uid_nfc yang ADA di kolom users.uid_nfc di DB kamu
// Query: SELECT uid_nfc, role FROM users WHERE uid_nfc IS NOT NULL LIMIT 20;
export const USERS = {
  produksi:    ["5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "70", "71", "72", "73", "74", "75", "76", "77", "78", "79", "80", "81", "82", "83", "84", "85", "86", "87"],
  maintenance: ["107", "108", "109", "110", "111", "112"],
  supervisor:  ["04:EF:56:1A:60:1B:90"],
  admin:       ["2"],
};

// ─── ID Master Data ────────────────────────────────────────────────────────
// Ganti dengan ID yang sesuai dari database kamu
export const MASTER = {
  mesinIds: Array.from({ length: 67 }, (_, i) => i + 1), // ID mesin 1 - 67
  masalahIds: [1, 2, 3, 4, 5],        // ID masalah lebih banyak
  shiftIds: [1, 2, 3],                
  operatorIds: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 
  produkIds: [1, 2, 3, 4, 5],         
  targetIds: [1, 2, 3],               
  jenisPekerjaanIds: [1, 2, 3],       
  kanagataList: ["KNG-001", "KNG-002", "KNG-003", "KNG-004", "KNG-005"],
  noLotList: ["LOT-2026-001", "LOT-2026-002", "LOT-2026-003", "LOT-2026-004"],
};

// ─── Kategori Masalah ─────────────────────────────────────────────────────
// Pisahkan ID masalah berdasarkan kategori untuk flow yang benar
export const MASALAH_CAT = {
  plan_downtime: [26, 27, 28, 29, 30, 31, 32, 33, 34], // Pastikan ID ini kategori PLAN_DOWNTIME di DB
  unplanned: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 44],     // Pastikan ID ini kategori BREAKDOWN/dll di DB
};

// ─── Helper: Pilih random dari array ──────────────────────────────────────
export function randomItem(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Generate data RPH random ─────────────────────────────────────────────
export function randomRphPayload(operatorId) {
  const today = new Date().toISOString().split("T")[0];
  return {
    fk_id_user: operatorId,
    fk_id_mesin: randomItem(MASTER.mesinIds),
    fk_id_produk: randomItem(MASTER.produkIds),
    fk_id_shift: randomItem(MASTER.shiftIds),
    fk_id_target: randomItem(MASTER.targetIds),
    fk_id_jenis_pekerjaan: randomItem(MASTER.jenisPekerjaanIds),
    tanggal: today,
    keterangan: "Created by k6 stress test",
  };
}

// ─── Generate data LRP random ─────────────────────────────────────────────
export function randomLrpPayload(operatorId, rphId, machineId) {
  const today = new Date().toISOString().split("T")[0];
  return {
    tanggal: today,
    fk_id_shift: randomItem(MASTER.shiftIds),
    fk_id_mesin: machineId || randomItem(MASTER.mesinIds),
    fk_id_operator: operatorId,
    fk_id_rph: rphId,
    no_kanagata: randomItem(MASTER.kanagataList),
    no_lot: randomItem(MASTER.noLotList),
    no_reg: `REG-${Date.now()}-${Math.floor(Math.random() * 999)}`,
    qty_ok: Math.floor(Math.random() * 50) + 10,
    qty_ng_prev: Math.floor(Math.random() * 3),
    qty_ng_proses: Math.floor(Math.random() * 3),
    qty_rework: Math.floor(Math.random() * 2),
  };
}

// ─── Generate payload Andon Call (untuk Unplanned) ────────────────────────
export function randomAndonCallPayload() {
  const divisi = ["MAINTENANCE", "QUALITY", "DIE_MAINT"];
  return {
    fk_id_mesin: randomItem(MASTER.mesinIds),
    target_divisi: randomItem(divisi),
  };
}

// ─── Generate payload Andon Trigger (khusus PLAN_DOWNTIME) ────────────────
export function randomAndonTriggerPayload() {
  return {
    fk_id_mesin: randomItem(MASTER.mesinIds),
    fk_id_masalah: randomItem(MASALAH_CAT.plan_downtime),
  };
}

// ─── Return Random Unplanned Masalah ID ──────────────────────────────────
export function randomUnplannedMasalahId() {
  return randomItem(MASALAH_CAT.unplanned);
}
