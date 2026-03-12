import net from "net";
import logger from '../config/logger.js';

// memori sementara untuk menyimpan koneksi pipa dari setiap hardware yang aktif
const connectedDevices = new Map();

/**
 * Fungsi ini digunakan oleh HTTP Controller untuk mengirim pesan spesifik ke sebuah mesin
 * @param {string} deviceId - ID Mesin tujuan, misalnya "FB1100A"
 * @param {Object} payload - Objek JSON perintah, misal { task: "MTC", cmd: "CALL" }
 * @returns {boolean} - true jika berhasil, false jika mesin sedang offline
 */

const sendCommandToDevice = (deviceId, payload) => {
    const deviceSocket = connectedDevices.get(deviceId);

    if (deviceSocket) {
        try {
            const dataString = JSON.stringify(payload) + '\n';

            deviceSocket.write(dataString);

            logger.info(`[TCP] Sukses mengirim perintah ke alat ${deviceId}: ${dataString.trim()}`);
            return true;
        } catch (error) {
            logger.error(`[TCP] Gagal mengirim perintah ke alat ${deviceId}:`, error);
            return false;
        }
    } else {
        logger.warn(`[TCP] Alat ${deviceId} sedang offline/tidak ditemukan.`);
        return false;
    }
};

/**
 * Fungsi untuk menginisialisasi TCP Server
 * @param {number} port - Port yang akan digunakan (misal 8080)
 */

const initTcpServer = (port = 4210) => {
    const server = net.createServer((socket) => {
        let currentDeviceId = null;
        logger.info(`[TCP] Koneksi baru masuk dari: ${socket.remoteAddress}:${socket.remotePort}`);

        socket.on('data', (data) => {
            try {
                const incomingMsg = data.toString().trim();
                logger.info(`[TCP] Pesan diterima: ${incomingMsg}`);

                const parsed = JSON.parse(incomingMsg);

                if (parsed.type === 'register' && parsed.deviceId) {
                    currentDeviceId = parsed.deviceId;

                    connectedDevices.set(currentDeviceId, socket);

                    logger.info(`[TCP] Alat ${currentDeviceId} berhasil diregistrasi.`);
                    // Opsional: Kirim balasan koneksi sukses ke ESP32
                    socket.write(JSON.stringify({ status: 'registered', deviceId: currentDeviceId }) + '\n');
                }

            } catch (error) {
                logger.error('[TCP] Gagal membaca data yang masuk sebagai JSON:', error.message);
            }

        });

        socket.on('error', (err) => {
            logger.error(`[TCP] Ada error pada koneksi socket: ${err.message}`);
            // Lakukan pembersihan memori juga saat error patah koneksi
            if (currentDeviceId) {
                connectedDevices.delete(currentDeviceId);
            }
        });

        // Jalankan server di background
    });
    server.listen(port, () => {
        logger.info(`[TCP] Server siap siaga mendengar hardware di port ${port}`);
    });

}

export default {
    initTcpServer,
    sendCommandToDevice,
};