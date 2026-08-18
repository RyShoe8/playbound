"use client";

import { recaptchaConfigured, RECAPTCHA_BLOCKED_HINT } from "@/lib/recaptchaClient";

/** Shown when the reCAPTCHA script never loaded (Brave Shields, blockers). */
export function RecaptchaBlockedNote({ blocked }: { blocked: boolean }) {
  if (!blocked || !recaptchaConfigured()) return null;
  return <p className="text-xs text-destructive">{RECAPTCHA_BLOCKED_HINT}</p>;
}
