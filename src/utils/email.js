import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Konfigurasi Email Testing
export const EMAIL_AM_PER_PLANT = {
  1: ["putrajon403@gmail.com", "puutradev02@gmail.com", "renggars30@gmail.com"],
  2: ["puutradev02@gmail.com"],
  3: ["renggars30@gmail.com"],
};

export const EMAIL_HR = ["renggarendy0@gmail.com"];

/*
export const EMAIL_AM_PER_PLANT_PROD = {
  1: [
    "abelbryan54@gmail.com",
    "fachrulrozidewantoiswara@gmail.com",
    "wicaksono.bayu11@gmail.com",
    "rochrisp@gmail.com",
    "Harismuzzaqi@gmail.com",
    "ivan.afandri@gmail.com",
    "agashery@gmail.com",
    "fiqihyuniarto@gmail.com",
  ],
  2: [
    "arifrohman17071979@gmail.com",
    "fachrulrozidewantoiswara@gmail.com",
    "heri.wgm38@gmail.com",
    "sudiyonoyn@gmail.com",
    "Ari.langgeng.kusnanto95@gmail.com",
    "sukocoeko08@gmail.com",
  ],
  3: [
    "rickyhariadi.wibowo@gmail.com",
    "anisa.neutron@gmail.com",
    "tonyaxis3@gmail.com",
    "mnibrahim55@gmail.com",
  ],
};

export const EMAIL_HR_PROD = ["pga@toshinprima.co.id", "siwiputri09@gmail.com"];
*/

export const sendAlertEmail = async (to, subject, html) => {
  const mailOptions = {
    from: `"Toshin Monitoring" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Notifikasi email terkirim ke: ${to}`);
  } catch (error) {
    console.error("❌ Gagal mengirim email:", error);
  }
};
