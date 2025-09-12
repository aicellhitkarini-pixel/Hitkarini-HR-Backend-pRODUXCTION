const transporter = require("../utils/sendEmail");

async function sendHrEmail({ to, subject, message }) {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333;">
        ${message}
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"HR Team" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log("Email sent to:", to);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

module.exports = { sendHrEmail };