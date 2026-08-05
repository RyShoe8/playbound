/**
 * Report the URLs authentication actually derives from, and flag the shapes
 * that break OAuth silently.
 *
 * NextAuth v4 builds the OAuth `redirect_uri` from NEXTAUTH_URL. Google
 * compares it to the registered URI byte for byte, so a trailing slash, a
 * `www.` that is not registered, or `http` instead of `https` all surface as
 * the same opaque `Error 400: redirect_uri_mismatch` with no indication of
 * what was actually sent.
 *
 * This prints the computed redirect_uri so it can be compared with the
 * registered value directly, instead of guessing. Runs on every deploy and
 * never fails the build — it is a diagnostic, not a gate.
 *
 *   npx tsx scripts/check-auth-urls.ts
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const problems: string[] = [];
const notes: string[] = [];

const nextAuthUrl = (process.env.NEXTAUTH_URL || "").trim();
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://playbound.club").replace(/\/$/, "");
const vercelEnv = process.env.VERCEL_ENV || "(not on Vercel)";

console.log("PlayBound — authentication URL check");
console.log("=".repeat(58));
console.log(`  VERCEL_ENV             ${vercelEnv}`);
console.log(`  NEXTAUTH_URL           ${nextAuthUrl || "(not set)"}`);
console.log(`  NEXT_PUBLIC_SITE_URL   ${process.env.NEXT_PUBLIC_SITE_URL || "(not set → default)"}`);
console.log(`  Canonical site origin  ${siteUrl}`);

if (!nextAuthUrl) {
  problems.push(
    "NEXTAUTH_URL is not set. NextAuth falls back to request headers, which on " +
      "Vercel can be a per-deployment host — OAuth redirect_uri then fails to match."
  );
} else {
  // The exact string NextAuth will send to Google.
  const redirectUri = `${nextAuthUrl.replace(/\/$/, "")}/api/auth/callback/google`;
  console.log("");
  console.log(`  Google redirect_uri    ${redirectUri}`);
  console.log("    ↑ must match the Authorised redirect URI in Google Cloud Console exactly");

  if (nextAuthUrl.endsWith("/")) {
    problems.push(
      `NEXTAUTH_URL has a trailing slash ("${nextAuthUrl}"). NextAuth concatenates paths ` +
        "onto it, producing a double slash that Google treats as a different URI."
    );
  }
  if (/^http:\/\//i.test(nextAuthUrl) && vercelEnv === "production") {
    problems.push(`NEXTAUTH_URL uses http:// in production ("${nextAuthUrl}"). It must be https://.`);
  }
  if (/\.vercel\.app/i.test(nextAuthUrl)) {
    problems.push(
      `NEXTAUTH_URL points at a Vercel host ("${nextAuthUrl}"). Per-deployment URLs stop ` +
        "resolving once superseded, which breaks sign-out and emailed links with " +
        "DEPLOYMENT_NOT_FOUND. Use the custom domain."
    );
  }

  const normalise = (u: string) => u.replace(/\/$/, "").replace(/^https?:\/\/(www\.)?/i, "");
  if (normalise(nextAuthUrl) !== normalise(siteUrl)) {
    problems.push(
      `NEXTAUTH_URL (${nextAuthUrl}) and the canonical site origin (${siteUrl}) are different ` +
        "hosts. Auth redirects and emailed links will point at different places."
    );
  } else if (nextAuthUrl.replace(/\/$/, "") !== siteUrl) {
    notes.push(
      `NEXTAUTH_URL (${nextAuthUrl}) and the site origin (${siteUrl}) differ only by scheme or ` +
        "www. Google matches redirect URIs exactly, so register whichever one is sent."
    );
  }
}

console.log("");
for (const note of notes) console.log(`  NOTE     ${note}`);
for (const problem of problems) console.log(`  PROBLEM  ${problem}`);

if (problems.length === 0 && notes.length === 0) {
  console.log("  OK — authentication URLs look consistent.");
}
console.log("=".repeat(58));

// Diagnostic only: a deploy must never be blocked by this.
process.exit(0);
