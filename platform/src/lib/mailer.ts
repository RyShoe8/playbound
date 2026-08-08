const FROM_EMAIL_DEFAULT = "playboundclub@gmail.com";
const FROM_NAME_DEFAULT = "PlayBound";

/**
 * Sends a transactional email via Brevo when BREVO_API_KEY is configured.
 * Without it (local dev), the email content is logged so verification links
 * remain usable without a mail provider.
 */
export async function sendMail(to: string, subject: string, html: string) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.MAIL_FROM_EMAIL || FROM_EMAIL_DEFAULT;
  const fromName = process.env.MAIL_FROM_NAME || FROM_NAME_DEFAULT;

  if (!apiKey) {
    console.log(`[mailer] BREVO_API_KEY not set — logging email instead of sending.\nTo: ${to}\nSubject: ${subject}\n${html}`);
    return;
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
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

export function passwordResetEmailHtml(resetUrl: string) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Reset your PlayBound password</h2>
      <p>We received a request to reset the password for your account.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;background:#7c5cf0;color:#fff;
          padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold;">
          Reset Password
        </a>
      </p>
      <p>Or paste this link into your browser:<br>${resetUrl}</p>
      <p style="color:#888;font-size:12px;">This link expires in 24 hours. If you didn't request a reset, you can ignore this email.</p>
    </div>
  `;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function friendInviteEmailHtml(inviterUsername: string, signupUrl: string) {
  const name = escapeHtml(inviterUsername || "Someone");
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>${name} invited you to PlayBound</h2>
      <p>PlayBound is a home for high-quality free games — and a place to see what friends are playing.</p>
      <p>
        <a href="${signupUrl}" style="display:inline-block;background:#7c5cf0;color:#fff;
          padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold;">
          Join PlayBound
        </a>
      </p>
      <p>Or paste this link into your browser:<br>${signupUrl}</p>
      <p style="color:#888;font-size:12px;">This invite expires in 14 days. If you weren't expecting this, you can ignore it.</p>
    </div>
  `;
}

export function friendRequestInviteEmailHtml(inviterUsername: string, friendsUrl: string) {
  const name = escapeHtml(inviterUsername || "Someone");
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>${name} wants to be friends on PlayBound</h2>
      <p>Open Friends to accept or decline their request.</p>
      <p>
        <a href="${friendsUrl}" style="display:inline-block;background:#7c5cf0;color:#fff;
          padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold;">
          Open Friends
        </a>
      </p>
      <p>Or paste this link into your browser:<br>${friendsUrl}</p>
    </div>
  `;
}

