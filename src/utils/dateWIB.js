import moment from "moment-timezone";

const TZ = "Asia/Jakarta";

/**
 * Mengembalikan Date object yang NILAINYA sudah digeser ke WIB.
 *
 * Mengapa perlu ini?
 * Prisma selalu mengirim DateTime ke MySQL dalam UTC (JS Date selalu UTC).
 * MySQL DATETIME column menyimpan nilai apa adanya tanpa konversi.
 * Jadi jika kita kirim UTC, MySQL simpan UTC.
 *
 * Solusi: kita buat Date object yang "pura-pura" UTC tapi nilainya WIB.
 * Contoh: WIB 09:22 → kita buat Date yang jika dibaca UTC menunjukkan 09:22
 *
 * @returns {Date} Date object yang nilainya = waktu WIB saat ini
 */
export const nowWIB = () => {
  // Ambil waktu sekarang dalam WIB sebagai string
  const wibString = moment().tz(TZ).format("YYYY-MM-DDTHH:mm:ss.SSS");
  // Parse string itu sebagai UTC → DB akan menyimpan nilai WIB
  return new Date(wibString + "Z");
};

/**
 * Konversi Date object (UTC dari DB) ke representasi WIB yang benar
 * untuk keperluan kalkulasi/display.
 *
 * @param {Date} date
 * @returns {moment.Moment}
 */
export const toWIB = (date) => moment(date).tz(TZ);

/**
 * Hitung selisih dalam menit antara dua Date (keduanya harus konsisten,
 * keduanya nowWIB() atau keduanya new Date()).
 *
 * @param {Date} end
 * @param {Date} start
 * @returns {number} menit dengan 2 desimal
 */
export const diffMinutes = (end, start) => {
  return Number(((end - start) / 60000).toFixed(2));
};
