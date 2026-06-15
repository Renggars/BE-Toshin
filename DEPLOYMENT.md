# Server Deployment Guide (Full Docker)

Ikuti langkah-langkah ini untuk melakukan deployment bersih di PC Server Anda.

## 1. Bersihkan Service Lama (Fresh Start)

Jika di server Anda sudah ada container atau volume lama yang mungkin berkonflik, jalankan perintah ini di folder project lama (atau di mana saja jika ingin menghapus semua):

```bash
# Berhenti dan hapus semua container, network, dan image yang terkait project ini
docker-compose down --rmi all --volumes --remove-orphans
```

---

## 2. Persiapan Folder & Kode Baru

1.  **Clone Repository**:
    ```bash
    # Gunakan branch utama (main/master) atau sesuai branch project terbaru
    git clone https://github.com/Renggars/BE-Toshin.git
    cd BE-Toshin
    ```

2.  **Siapkan file `.env`**:
    Pastikan file `.env` sudah ada dan memiliki konfigurasi dasar. Untuk Docker, variabel database/redis akan di-override otomatis oleh `docker-compose.yml`, jadi Anda tidak perlu pusing mengubah URL di `.env`.

---

## 3. Jalankan Stack Monitoring & App

Jalankan perintah sakti ini:

```bash
docker-compose up -d --build
```

---

## 4. Verifikasi di Server

1.  **Cek Container**:
    ```bash
    docker-compose ps
    ```
    Pastikan service utama (`toshin-app`, `toshin-mysql`, `toshin-redis`) dan stack monitoring (`alloy`, `loki`, `tempo`, `prometheus`, `grafana`, `nginx`) berstatus `healthy` atau `running`.

2.  **Cek Log Startup App**:
    ```bash
    docker logs -f toshin-app
    ```
    Pastikan Anda melihat tulisan `--- Initialization Finished. Starting Application... ---`.

3.  **Akses Dashboard & API**:
    - **Nginx (Proxy Utama)**: `http://<IP-SERVER>` (Port 80)
    - **Grafana**: `http://<IP-SERVER>:3000` (Default login: admin/admin)
    - **Backend API (Direct)**: `http://<IP-SERVER>:4001`
    - **Prometheus**: `http://<IP-SERVER>:9090`
    - **Health Check App**: `http://<IP-SERVER>:4001/health`

---

## Tips Troubleshooting

- **Database Stuck**: Jika terjadi error migrasi (P3009), jalankan `docker-compose down -v` lalu `up` lagi untuk mereset volume database sepenuhnya.
- **Port Terpakai**: Pastikan port 80 (Nginx), 4001 (App), 3000 (Grafana), 9090 (Prometheus), 6380, dan 3307 tidak sedang dipakai oleh aplikasi native di server.
- **Docker Desktop (Windows)**: Jika mencoba deploy di Windows, `node-exporter` mungkin tidak bisa membaca metrics host secara penuh karena keterbatasan akses `/proc` dan `/sys`. Ini normal, service lain tetap berjalan.

Selamat mencoba di PC Server! 🚀
