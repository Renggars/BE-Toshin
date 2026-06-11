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
    git clone -b feature/full-docker-monitoring https://github.com/Renggars/BE-Toshin.git
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
    Pastikan `toshin-app`, `toshin-mysql`, `toshin-redis`, dll berstatus `healthy` atau `running`.

2.  **Cek Log Startup**:
    ```bash
    docker logs -f toshin-app
    ```
    Pastikan Anda melihat tulisan `--- Initialization Finished. Starting Application... ---` dan tidak ada error koneksi Loki.

3.  **Akses Dashboard**:
    - **Grafana**: `http://<IP-SERVER>:3000` (Default login: admin/admin)
    - **Backend API**: `http://<IP-SERVER>:4001`
    - **Health Check**: `http://<IP-SERVER>:4001/health`

---

## Tips Troubleshooting

- **Database Stuck**: Jika terjadi error migrasi (P3009), jalankan `docker-compose down -v` lalu `up` lagi untuk mereset volume database sepenuhnya.
- **Port Terpakai**: Pastikan port 4001, 3000, 9090, 6380, dan 3307 tidak sedang dipakai oleh aplikasi native di server.

Selamat mencoba di PC Server! 🚀
