import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
