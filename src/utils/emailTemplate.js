export const getEmailTemplate = (
  operator,
  namaPelanggaran,
  sisaPoin,
  alertType,
) => {
  return `
    <div style="font-family: sans-serif; border: 1px solid #ddd; padding: 20px; max-width: 600px;">
      <h2 style="color: #d32f2f;">Notifikasi Disiplin: ${alertType}</h2>
      <p>Halo Supervisor,</p>
      <p>Sistem mendeteksi penurunan poin signifikan pada operator berikut:</p>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Nama:</b></td><td>${operator.nama}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Plant:</b></td><td>Plant ${operator.plant}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Pelanggaran:</b></td><td>${namaPelanggaran}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><b>Sisa Poin:</b></td><td style="color: red; font-weight: bold;">${sisaPoin}</td></tr>
      </table>
      <p style="margin-top: 20px;">Mohon segera lakukan pembinaan atau tindakan sesuai aturan perusahaan.</p>
    </div>
  `;
};

// /*********************************************************
//  * EMAIL
//  *********************************************************/
// function kirimEmailAMPlant(plant, d) {
//   const plantKey = Number(plant);
//   const daftarEmail = EMAIL_AM_PER_PLANT[plantKey];

//   if (!daftarEmail || daftarEmail.length === 0) return;

//   MailApp.sendEmail({
//     to: daftarEmail.join(","),
//     subject: `[${d.statusBaru}] ${d.namaOperator} (${d.operatorId})`,
//     body: `Yth. Assistant Manager (Prod/Qty/Eng/Mtc/PPIC) Plant ${plant} PT. Toshin Prima Fine Blanking

// Nama : ${d.namaOperator}
// ID   : ${d.operatorId}
// Plant: ${plant}
// Shift: ${d.shift}
// Supervisor: ${d.supervisor}

// Pelanggaran:
// ${d.pelanggaran}

// Keterangan:
// ${d.keterangan}

// Poin: ${d.poinSebelum} → ${d.poinSesudah}
// Status: ${d.statusBaru}
// Tanggal: ${d.timestamp}

// ===============================
// Riwayat Pelanggaran Menuju Status ${d.statusBaru}:
// ===============================
// ${d.riwayatPelanggaran}

// Total Akumulasi Pengurangan: -${d.totalMinusRiwayat} poin
// `,
//   });
// }
