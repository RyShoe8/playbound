"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/** Google's mark, inlined so there is no external request on the auth pages. */
function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Kicks off the Google authorization code flow.
 *
 * Redirects rather than using `redirect: false` — the flow leaves the origin
 * entirely, so there is nothing useful to handle client-side. Errors come back
 * as ?error= on /login and are rendered there.
 */
export function GoogleSignInButton({
  callbackUrl = "/profile",
  label = "Continue with Google",
}: {
  callbackUrl?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signIn("google", { callbackUrl });
      }}
      className="flex h-10 w-full items-center justify-center gap-2.5 rounded-full border border-input bg-secondary/50 text-sm font-bold transition-colors hover:bg-secondary disabled:opacity-60"
    >
      <GoogleMark />
      {busy ? "Redirecting…" : label}
    </button>
  );
}

/** "or" rule between the Google button and the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3 py-4">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        or
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Maps NextAuth / PlayBound error codes to something a person can act on. */
export function authErrorMessage(code: string | null): string | null {
  if (!code) return null;
  switch (code) {
    case "EmailNotVerified":
      return "That Google account has an unverified email address. Verify it with Google, then try again.";
    case "AccountDisabled":
      return "This account has been disabled. Contact support if you think this is a mistake.";
    case "NoEmail":
      return "Google didn't share an email address for that account, so we can't sign you in.";
    case "OAuthAccountNotLinked":
      return "This email is already registered. Sign in with your password, then link Google from your profile.";
    case "OAuthSignin":
    case "OAuthCallback":
    case "Callback":
      return "Google sign-in failed. Please try again.";
    case "AccessDenied":
      return "Access denied — you cancelled the Google sign-in.";
    case "Configuration":
      return "Sign-in is misconfigured. Please let us know if this keeps happening.";
    default:
      return "Something went wrong signing you in. Please try again.";
  }
}
