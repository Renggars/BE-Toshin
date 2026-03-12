# k6 Stress Test — Toshin Backend

Folder ini berisi semua script k6 untuk performance & stress testing backend Toshin.

## Struktur

```
k6/
├── config.js           ← Base URL dan threshold global
├── utils/
│   ├── auth.js         ← Helper login & authHeaders
│   └── data.js         ← ⚠️ SESUAIKAN data user & master ID di sini!
└── tests/
    ├── smoke.js        ← Quick sanity check (2 VU, 30 detik)
    ├── load.js         ← Load test realistik (ramp ke 50 VU)
    ├── stress.js       ← Cari breaking point (ramp ke 200 VU)
    └── scenario.js     ← Full skenario produksi (3 role paralel)
```

## Persiapan

### 1. Install k6
```bash
# Windows (via winget)
winget install k6

# Atau download dari https://k6.io/docs/getting-started/installation/
```

### 2. Sesuaikan `utils/data.js`
Edit file `k6/utils/data.js` dan isi:
- Email & password user per role (`USERS.produksi`, `USERS.maintenance`, dll)
- ID master data (`MASTER.mesinIds`, `MASTER.shiftIds`, dll)

Jalankan query ini di DB untuk mendapatkan ID yang valid:
```sql
SELECT id, email, role FROM users LIMIT 20;
SELECT id FROM mesin LIMIT 10;
SELECT id FROM masalah LIMIT 10;
SELECT id FROM shift LIMIT 5;
```

### 3. Pastikan backend berjalan

---

## Cara Menjalankan

### Smoke Test (mulai di sini)
```bash
k6 run k6/tests/smoke.js
```

### Load Test
```bash
k6 run k6/tests/load.js
```

### Stress Test (hati-hati di prod!)
```bash
k6 run k6/tests/stress.js
```

### Full Scenario Test
```bash
k6 run k6/tests/scenario.js
```

### Dengan ngrok / custom URL
```bash
k6 run --env BASE_URL=https://xxxx.ngrok-free.app k6/tests/load.js
```

---

## Metrik yang Perlu Diperhatikan

| Metrik | Target | Kritis jika |
|---|---|---|
| `http_req_duration{p(95)}` | < 500ms (write), < 1s (read) | > 2000ms |
| `http_req_failed` | < 1% | > 5% |
| `http_reqs` (RPS) | — | Turun drastis saat VU naik |
| `vus` | — | Lihat di berapa VU sistem mulai gagal |

---

## Interpretasi Hasil → Estimasi VPS

| p(95) Latency | Error Rate | Estimasi VPS |
|---|---|---|
| < 200ms | < 1% | 1 vCPU, 1GB RAM |
| 200-500ms | < 1% | 2 vCPU, 2GB RAM |
| 500ms-1s | < 2% | 2 vCPU, 4GB RAM |
| > 1s | < 5% | 4 vCPU, 8GB RAM+ |

---

## Tips

- Jalankan **smoke test dulu** untuk memastikan script berjalan
- Saat stress test, monitor CPU & RAM server di sisi lain
- Jika pakai Docker, gunakan `docker stats` untuk melihat resource usage
- Gunakan `k6 run --out json=result.json` untuk simpan output ke file
