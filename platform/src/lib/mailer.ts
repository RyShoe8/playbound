const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.MAIL_FROM_EMAIL || "playboundclub@gmail.com";
const FROM_NAME = process.env.MAIL_FROM_NAME || "PlayBound";

/**
 * Sends a transactional email via Brevo when BREVO_API_KEY is configured.
 * Without it (local dev), the email content is logged so verification links
 * remain usable without a mail provider.
 */
export async function sendMail(to: string, subject: string, html: string) {
  if (!BREVO_API_KEY) {
    console.log(`[mailer] BREVO_API_KEY not set — logging email instead of sending.\nTo: ${to}\nSubject: ${subject}\n${html}`);
    return;
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: FROM_EMAIL, name: FROM_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${body}`);
  }
}

export function verificationEmailHtml(username: string, verifyUrl: string) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Welcome to PlayBound, ${username}!</h2>
      <p>Confirm your email address to activate your account.</p>
      <p>
        <a href="${verifyUrl}" style="display:inline-block;background:#7c5cf0;color:#fff;
          padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold;">
          Verify Email
        </a>
      </p>
      <p>Or paste this link into your browser:<br>${verifyUrl}</p>
      <p style="color:#888;font-size:12px;">This link expires in 24 hours. If you didn't create a PlayBound account, you can ignore this email.</p>
    </div>
  `;
}
