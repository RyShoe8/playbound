"use client";

/**
 * Client-side reCAPTCHA v3 token minting.
 *
 * The script is loaded lazily on first use rather than site-wide. Loading it
 * globally would put a third-party request and a tracking-capable script on
 * every page including ones with no form at all, which is both a performance
 * cost and a privacy one for a site whose pitch is "no strings attached".
 */

const SCRIPT_ID = "recaptcha-v3";

type Grecaptcha = {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, opts: { action: string }) => Promise<string>;
};

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

let loader: Promise<Grecaptcha | null> | null = null;

export function recaptchaSiteKey(): string | undefined {
  return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
}

export function recaptchaConfigured(): boolean {
  return Boolean(recaptchaSiteKey());
}

function loadScript(siteKey: string): Promise<Grecaptcha | null> {
  if (loader) return loader;

  loader = new Promise<Grecaptcha | null>((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    if (window.grecaptcha) return resolve(window.grecaptcha);

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.grecaptcha ?? null));
      existing.addEventListener("error", () => resolve(null));
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.grecaptcha ?? null);
    script.onerror = () => {
      // Blocked by an extension or offline. Resolve null so callers degrade to
      // sending no token; the server decides what to do about that.
      loader = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });

  return loader;
}

/**
 * Mint a token for an action.
 *
 * Returns null when reCAPTCHA is not configured or the script could not load —
 * callers should still submit. Refusing to submit would hand every ad blocker
 * a way to break signup, and the server already treats a missing token
 * according to its own policy.
 *
 * Tokens expire after two minutes, so this must be called at submit time and
 * never cached.
 */
export async function getRecaptchaToken(action: string): Promise<string | null> {
  const siteKey = recaptchaSiteKey();
  if (!siteKey) return null;

  try {
    const grecaptcha = await loadScript(siteKey);
    if (!grecaptcha) return null;

    await new Promise<void>((resolve) => grecaptcha.ready(() => resolve()));
    return await grecaptcha.execute(siteKey, { action });
  } catch (err) {
    console.warn("[recaptcha] token request failed:", err);
    return null;
  }
}
