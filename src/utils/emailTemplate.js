export const getAMEmailTemplate = (data) => {
  const {
    statusBaru,
    namaOperator,
    no_reg,
    plant,
    shift,
    supervisor,
    pelanggaran,
    keterangan,
    poinSebelum,
    poinSesudah,
    timestamp,
    riwayatPelanggaran,
    totalMinusRiwayat,
  } = data;

  const formattedDate = new Date(timestamp).toLocaleString("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  return `
    <div style="font-family: sans-serif; line-height: 1.5; color: #333; max-width: 600px; border: 1px solid #ddd; padding: 20px; border-radius: 8px;">
      <h2 style="color: #d32f2f; border-bottom: 2px solid #d32f2f; padding-bottom: 10px;">Notifikasi Disiplin: ${statusBaru}</h2>
      
      <p>Yth. Assistant Manager (Prod/Qty/Eng/Mtc/PPIC) Plant ${plant} PT. Toshin Prima Fine Blanking</p>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr><td style="padding: 5px; width: 150px;"><b>Nama:</b></td><td>${namaOperator}</td></tr>
        <tr><td style="padding: 5px; width: 150px;"><b>No. Reg:</b></td><td>${no_reg}</td></tr>
        <tr><td style="padding: 5px;"><b>Plant:</b></td><td>${plant}</td></tr>
        <tr><td style="padding: 5px;"><b>Shift:</b></td><td>${shift}</td></tr>
        <tr><td style="padding: 5px;"><b>Supervisor:</b></td><td>${supervisor}</td></tr>
      </table>

      <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #d32f2f; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: #d32f2f;">Detail Pelanggaran</h3>
        <p><b>Pelanggaran:</b><br>${pelanggaran}</p>
        <p><b>Keterangan:</b><br>${keterangan}</p>
      </div>

      <div style="margin-bottom: 20px;">
        <p><b>Poin:</b> ${poinSebelum} &rarr; <span style="color: red; font-weight: bold;">${poinSesudah}</span></p>
        <p><b>Status:</b> <span style="background-color: #d32f2f; color: white; padding: 2px 8px; border-radius: 4px;">${statusBaru}</span></p>
        <p><b>Tanggal:</b> ${formattedDate}</p>
      </div>

      <div style="border-top: 1px dashed #ccc; padding-top: 15px;">
        <h4 style="margin-bottom: 10px;">Riwayat Pelanggaran Menuju Status ${statusBaru}:</h4>
        <pre style="background: #eee; padding: 10px; border-radius: 4px; white-space: pre-wrap; font-family: monospace;">${riwayatPelanggaran}</pre>
        <p><b>Total Akumulasi Pengurangan:</b> -${totalMinusRiwayat} poin</p>
      </div>
    </div>
  `;
};

export const getHREmailTemplate = (data) => {
  const {
    statusBaru,
    namaOperator,
    no_reg,
    plant,
    poinSebelum,
    poinSesudah,
    pelanggaran,
    keterangan,
    timestamp,
  } = data;

  const formattedDate = new Date(timestamp).toLocaleString("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });

  return `
    <div style="font-family: sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
      <!-- Header -->
      <div style="background-color: #d32f2f; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0; font-size: 22px; letter-spacing: 1px;">NOTIFIKASI STATUS ${statusBaru}</h2>
      </div>
      
      <!-- Content -->
      <div style="padding: 30px;">
        <p style="margin-top: 0; font-size: 16px;">Halo Tim HR,</p>
        <p>Telah terdeteksi perubahan status disiplin untuk operator berikut:</p>
        
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse; background-color: #fcfcfc; border-radius: 8px; border: 1px solid #efefef;">
          <tr>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee; width: 140px; color: #666;"><b>Nama Operator</b></td>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee;">${namaOperator}</td>
          </tr>
          <tr>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #666;"><b>No. Reg</b></td>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee;">${no_reg}</td>
          </tr>
          <tr>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #666;"><b>Plant</b></td>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee;">Plant ${plant}</td>
          </tr>
          <tr>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #666;"><b>Poin</b></td>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee;">${poinSebelum} &rarr; <b style="color: #d32f2f;">${poinSesudah}</b></td>
          </tr>
           <tr>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #666;"><b>Status Baru</b></td>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee;"><span style="background-color: #d32f2f; color: white; padding: 3px 10px; border-radius: 4px; font-size: 14px; font-weight: bold;">${statusBaru}</span></td>
          </tr>
          <tr>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee; color: #666;"><b>Pelanggaran</b></td>
            <td style="padding: 12px 15px; border-bottom: 1px solid #eee;">${pelanggaran}</td>
          </tr>
        </table>

        <div style="background-color: #fff9f9; border-left: 4px solid #d32f2f; padding: 15px; margin-bottom: 25px;">
          <h4 style="margin: 0 0 10px 0; color: #d32f2f;">Keterangan:</h4>
          <p style="margin: 0; font-style: italic;">"${keterangan}"</p>
        </div>

        <p style="font-size: 13px; color: #888; margin-bottom: 0;">
          <b>Waktu Kejadian:</b> ${formattedDate}<br>
          <i>Email ini dikirim otomatis oleh Toshin Monitoring System.</i>
        </p>
      </div>
      
      <!-- Footer -->
      <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #999;">
        &copy; ${new Date().getFullYear()} PT. Toshin Prima Fine Blanking
      </div>
    </div>
  `;
};
