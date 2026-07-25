/**
 * Isolated Brevo send test — bypasses registration/MongoDB entirely so we
 * can see exactly what Brevo says when a send is rejected.
 *
 * Usage (from platform/):
 *   npx tsx scripts/test-email.ts you@example.com
 *
 * Loads platform/.env.local via @next/env (same as Next.js) before importing
 * the mailer, so BREVO_API_KEY is visible to sendMail().
 */
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());

  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npx tsx scripts/test-email.ts <recipient-email>");
    process.exit(1);
  }

  const { sendMail, verificationEmailHtml } = await import("../src/lib/mailer");

  console.log(`BREVO_API_KEY set: ${Boolean(process.env.BREVO_API_KEY)}`);
  console.log(
    `MAIL_FROM_EMAIL: ${process.env.MAIL_FROM_EMAIL || "(not set — using default playboundclub@gmail.com)"}`
  );
  console.log(`Sending test email to ${to}...`);

  try {
    await sendMail(
      to,
      "PlayBound test email",
      verificationEmailHtml("Tester", "https://example.com/verify?token=test")
    );
    console.log("sendMail() completed without throwing.");
    console.log(
      "If BREVO_API_KEY was set, check Brevo's Transactional > Email log now — it should show this send."
    );
    process.exit(0);
  } catch (err) {
    console.error("sendMail() threw an error:");
    console.error(err);
    process.exit(1);
  }
}

main();
