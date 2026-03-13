import net from "net";
import logger from '../config/logger.js';

// memori sementara untuk menyimpan koneksi pipa dari setiap hardware yang aktif
// const connectedDevices = new Map();
const connectedDevices = new Set();

/**
 * Fungsi ini digunakan oleh HTTP Controller untuk mengirim pesan spesifik ke sebuah mesin
 * @param {string} deviceId - ID Mesin tujuan, misalnya "FB1100A"
 * @param {Object} payload - Objek JSON perintah, misal { task: "MTC", cmd: "CALL" }
 * @returns {boolean} - true jika berhasil, false jika mesin sedang offline
 */

// FUNGSI DENGAN TIPE UNICAST (SERVER - ESP)
// const sendCommandToDevice =(deviceId, payload) => {
//     const deviceSocket = connectedDevices.get(deviceId);

//     if (deviceSocket) {
//         try {
//             // Format: Task;Mesin;Tim;Status (e.g. ANDON;FB1100;MAINTENANCE;CALL)
//             const targetName = payload.mesinName || deviceId; // Use actual machine name if provided, else fallback to deviceId (master)
//             const dataString = `${payload.task};${targetName};${payload.divisi};${payload.cmd}\n`;

//             deviceSocket.write(dataString);

//             logger.info(`[TCP] Sukses mengirim perintah ke alat ${deviceId} (Masalah pada mesin ${targetName}): ${dataString.trim()}`);
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


// FUNGSI DENGAN TIPE BROADCAST
const broadcastCommand = (payload) => {
    const dataString = `${payload.task};${payload.mesinName};${payload.divisi};${payload.cmd}\n`;

    let successCount = 0;
    for (const deviceSocket of connectedDevices) {
        try {
            deviceSocket.write(dataString);
            successCount++;
            logger.info(`[TCP] Berhasil menyiarkan ke soket terhubung`);
        } catch (error) {
            logger.error(`[TCP] Gagal menyiarkan ke soket terhubung`, error);
        }
    }

    if (successCount > 0) {
        logger.info(`[TCP] Sukses menyiarkan perintah ke ${successCount} alat aktif: ${dataString.trim()}`);
    } else {
        logger.warn(`[TCP] Perintah "${dataString.trim()}" gagal dikirim. Tidak ada satupun ESP yang sedang terhubung.`);
    }
};

/**
 * Fungsi untuk menginisialisasi TCP Server
 * @param {number} port - Port yang akan digunakan (misal 8080)
 */

const initTcpServer = (port = 4210) => {
    const server = net.createServer((socket) => {
        // let currentDeviceId = null;
        logger.info(`[TCP] Koneksi baru masuk dari: ${socket.remoteAddress}:${socket.remotePort}`);

        connectedDevices.add(socket);
        logger.info(`[TCP] Total perangkat aktif saat ini: ${connectedDevices.size}`);

        let currentDeviceId = null; // pindahkan scope ini ke atas event

        socket.on('data', (data) => {
            let incomingMsg = '';
            try {
                incomingMsg = data.toString().trim();
                logger.info(`[TCP] Pesan diterima: ${incomingMsg}`);

                // Cek apakah pesan berupa format string biasa, dan bukan JSON "{"
                if (incomingMsg.length > 0 && !incomingMsg.startsWith('{')) {
                    
                    // Kita anggap teks yang dikirim adalah ID perangkatnya
                    currentDeviceId = incomingMsg;
                    connectedDevices.add(socket); // simpan sebagai Set
                    
                    // Jika butuh menyimpan nama, karena pakai Set(), Anda harus menyimpan objek, tapi karena 
                    // implementasi Anda di atas pakai Set() untuk `deviceSocket of connectedDevices`, saya biarkan.
                    
                    logger.info(`[TCP] Alat ${currentDeviceId} (via Plain Text) berhasil diregistrasi.`);
                    logger.info(`[TCP] Total perangkat aktif saat ini: ${connectedDevices.size}`);
                    
                    // return agar tidak mencoba parse json di bawahnya
                    return; 
                }

                // Jika pesannya dimulai dengan `{`, coba parse sebagai JSON
                const parsed = JSON.parse(incomingMsg);

                if (parsed.type === 'register' && parsed.deviceId) {
                    currentDeviceId = parsed.deviceId;
                    connectedDevices.add(socket);

                    logger.info(`[TCP] Alat ${currentDeviceId} berhasil diregistrasi (via JSON).`);
                    logger.info(`[TCP] Total perangkat aktif saat ini: ${connectedDevices.size}`);

                    // Opsional: Kirim balasan koneksi sukses ke ESP32
                    socket.write(JSON.stringify({ status: 'registered', deviceId: currentDeviceId }) + '\n');
                }

            } catch (error) {
                logger.error(`[TCP] Gagal membaca data yang masuk sebagai JSON. Pesan asli: "${incomingMsg}"`);
            }
        });

        socket.on('error', (err) => {
            logger.error(`[TCP] Ada error pada koneksi socket: ${err.message}`);
            // Lakukan pembersihan memori juga saat error patah koneksi
            if (currentDeviceId) {
                // connectedDevices.delete(currentDeviceId); // Anda pakai Set(), jadi hapusnya soketnya
                connectedDevices.delete(socket);
                logger.info(`[TCP] Alat ${currentDeviceId} dihapus dari sesi karena error.`);
            }
        });
        
        socket.on('end', () => {
             if (currentDeviceId) {
                connectedDevices.delete(socket);
                logger.info(`[TCP] Alat ${currentDeviceId} terputus (disconnected)`);
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
    broadcastCommand,
};