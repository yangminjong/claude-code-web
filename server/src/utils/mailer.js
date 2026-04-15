import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[mailer] SMTP not configured — emails will be logged to console');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  return transporter;
}

/**
 * Generate a 6-digit verification code.
 */
export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Send a verification code email.
 * Falls back to console logging if SMTP is not configured.
 */
export async function sendVerificationEmail(to, code) {
  const from = process.env.SMTP_FROM || 'Claude Code Web <noreply@example.com>';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #e6edf3; background: #0d1117; padding: 24px; border-radius: 12px 12px 0 0; margin: 0; text-align: center;">
        Claude Code Web
      </h2>
      <div style="background: #161b22; padding: 32px; border: 1px solid #30363d; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #e6edf3; font-size: 16px; margin: 0 0 16px;">이메일 인증 코드:</p>
        <div style="background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 16px;">
          <span style="font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 700; color: #58a6ff; letter-spacing: 8px;">${code}</span>
        </div>
        <p style="color: #8b949e; font-size: 14px; margin: 0;">
          이 코드는 ${process.env.EMAIL_VERIFY_EXPIRE_MINUTES || 10}분 후 만료됩니다.
        </p>
      </div>
    </div>
  `;

  const mailOptions = {
    from,
    to,
    subject: '[Claude Code Web] 이메일 인증 코드',
    html
  };

  const smtp = getTransporter();
  if (!smtp) {
    console.log(`[mailer] Verification code for ${to}: ${code}`);
    return;
  }

  await smtp.sendMail(mailOptions);
  console.log(`[mailer] Verification email sent to ${to}`);
}
