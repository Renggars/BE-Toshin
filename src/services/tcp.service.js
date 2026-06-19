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

// CASE PERCOBAAN 1 : KIRIM JSON KE HARDWARE
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

// CASE PERCOBAAN 2 : KIRIM RAW STRING KE HARDWARE (KODE INI SEMENTARA)
// const sendCommandToDevice = (deviceId, commandString) => {
//     const deviceSocket = connectedDevices.get(deviceId);

//     if (deviceSocket) {
//         try {
//             // Kirim raw string langsung, tanpa JSON stringify
//             const dataString = commandString + '\n';
//             deviceSocket.write(dataString);
//             logger.info(`[TCP] Sukses mengirim perintah ke alat ${deviceId}: ${dataString.trim()}`);
//             return true;
//         } catch (error) {
//             logger.error(`[TCP] Gagal mengirim perintah ke alat ${deviceId}:`, error);
//             return false;
//         }
//     } else {
//         logger.warn(`[TCP] Alat ${deviceId} sedang offline/tidak ditemukan.`);
//         return false;
//     }
// };

/**
 * Fungsi untuk broadcast command ke seluruh hardware yang terhubung
 * @param {string} commandString - Raw command string
 */
const broadcastCommand = (commandString) => {
    let successCount = 0;
    const dataString = commandString + '\n';
    
    connectedDevices.forEach((socket, deviceId) => {
        try {
            socket.write(dataString);
            successCount++;
        } catch (error) {
            logger.error(`[TCP] Gagal mengirim broadcast ke alat ${deviceId}:`, error);
        }
    });
    
    if (successCount > 0) {
        logger.info(`[TCP] Broadcast sukses ke ${successCount} alat: ${dataString.trim()}`);
    } else {
        logger.warn(`[TCP] Gagal broadcast, tidak ada hardware yang online.`);
    }
    return successCount > 0;
};

/**
 * Fungsi untuk menginisialisasi TCP Server
 * @param {number} port - Port yang akan digunakan (misal 4210)
 */

const initTcpServer = (port = 4210) => {
    const server = net.createServer((socket) => {
        let currentDeviceId = null;
        logger.info(`[TCP] Koneksi baru masuk dari: ${socket.remoteAddress}:${socket.remotePort}`);

        socket.on('data', (data) => {
            const incomingMsg = data.toString().trim();
            if (!incomingMsg) return;
            
            logger.info(`[TCP] Pesan diterima: ${incomingMsg}`);

            try {
                const parsed = JSON.parse(incomingMsg);

                if (parsed.type === 'register' && parsed.deviceId) {
                    currentDeviceId = parsed.deviceId;

                    connectedDevices.set(currentDeviceId, socket);

                    logger.info(`[TCP] Alat ${currentDeviceId} berhasil diregistrasi (via JSON).`);
                    // Hapus balasan JSON agar tidak membuat ESP32 error
                }

            } catch (error) {
                // Fallback: Jika pesan bukan JSON (misal hardware hanya mengirim "ESP32_MASTER")
                if (!incomingMsg.startsWith('{') && !incomingMsg.startsWith('[')) {
                    currentDeviceId = incomingMsg; // Anggap string yang masuk adalah deviceId
                    connectedDevices.set(currentDeviceId, socket);
                    logger.info(`[TCP] Alat ${currentDeviceId} berhasil diregistrasi (via Raw String).`);
                    
                    // Hapus balasan JSON agar tidak membuat ESP32 error
                } else {
                    logger.error('[TCP] Gagal membaca data yang masuk sebagai JSON:', error.message);
                }
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
        logger.info(`\n🚀 [TCP] Server siap siaga mendengar hardware di port ${port}`);
    });

}

export default {
    initTcpServer,
    sendCommandToDevice,
    broadcastCommand,
};