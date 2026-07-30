/**
 * reCAPTCHA v3 verification.
 *
 * v3 returns a score (0.0 bot … 1.0 human) rather than a pass/fail challenge,
 * so the caller decides the threshold. Two rules matter and are easy to miss:
 *
 *  1. **Bind the action.** A token minted on the newsletter form is a valid
 *     token; without checking `action` an attacker could farm cheap tokens from
 *     a low-value form and spend them on signup. The action is asserted here,
 *     not trusted from the request body.
 *  2. **Tokens are single-use and expire after two minutes.** A replayed or
 *     stale token fails at Google, which is what we want.
 */

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const TIMEOUT_MS = 5000;

/** Below this, treat the request as automated. Tune with RECAPTCHA_MIN_SCORE. */
const DEFAULT_MIN_SCORE = 0.5;

export type RecaptchaAction =
  | "signup"
  | "login"
  | "newsletter"
  | "game_submission";

export type RecaptchaResult =
  | { ok: true; score: number | null; skipped: boolean }
  | { ok: false; reason: string; score: number | null };

export function recaptchaEnabled(): boolean {
  return Boolean(process.env.RECAPTCHA_SECRET_KEY);
}

function minScore(): number {
  const raw = Number(process.env.RECAPTCHA_MIN_SCORE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_MIN_SCORE;
}

type SiteVerifyResponse = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  challenge_ts?: string;
  "error-codes"?: string[];
};

/**
 * Verify a token against Google.
 *
 * Failure policy is deliberately asymmetric:
 *
 *  - A *definitive* rejection (bad token, wrong action, low score) fails closed.
 *  - A *transport* failure (Google unreachable, timeout) fails **open**, with a
 *    loud log. For a free games site, locking every new user out because
 *    Google had a blip is worse than briefly letting spam through. Flip
 *    RECAPTCHA_FAIL_CLOSED=true if that trade stops being right.
 */
export async function verifyRecaptcha(
  token: string | undefined | null,
  expectedAction: RecaptchaAction,
  opts: { remoteIp?: string | null } = {}
): Promise<RecaptchaResult> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;

  // Not configured — local dev, previews, CI. Same self-disabling pattern as
  // the Google provider so the app stays runnable without secrets.
  if (!secret) return { ok: true, score: null, skipped: true };

  if (!token) {
    return { ok: false, reason: "missing-token", score: null };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (opts.remoteIp) body.set("remoteip", opts.remoteIp);

  let data: SiteVerifyResponse;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`siteverify returned ${res.status}`);
    data = (await res.json()) as SiteVerifyResponse;
  } catch (err) {
    console.error("[recaptcha] verification unreachable:", err);
    if (process.env.RECAPTCHA_FAIL_CLOSED === "true") {
      return { ok: false, reason: "verification-unavailable", score: null };
    }
    return { ok: true, score: null, skipped: true };
  }

  if (!data.success) {
    const codes = data["error-codes"] ?? [];
    // timeout-or-duplicate means an expired or already-spent token, which is
    // usually a slow user rather than an attacker — worth distinguishing so
    // the UI can say "try again" instead of accusing them of being a bot.
    const expired = codes.includes("timeout-or-duplicate");
    return {
      ok: false,
      reason: expired ? "token-expired" : codes.join(",") || "verification-failed",
      score: null,
    };
  }

  if (data.action !== expectedAction) {
    console.warn(
      `[recaptcha] action mismatch: got "${data.action}", expected "${expectedAction}"`
    );
    return { ok: false, reason: "action-mismatch", score: data.score ?? null };
  }

  const score = typeof data.score === "number" ? data.score : null;
  if (score !== null && score < minScore()) {
    return { ok: false, reason: "low-score", score };
  }

  return { ok: true, score, skipped: false };
}

/** Message safe to show a user. Never leaks the score or the threshold. */
export function recaptchaErrorMessage(reason: string): string {
  switch (reason) {
    case "token-expired":
      return "That took a little too long — please try again.";
    case "missing-token":
      return "Couldn't complete the bot check. Refresh the page and try again.";
    case "verification-unavailable":
      return "Bot protection is temporarily unavailable. Please try again shortly.";
    default:
      return "We couldn't verify this request. If you're on a VPN or strict privacy extension, try disabling it and again.";
  }
}

/** Best-effort client IP from proxy headers, for the optional remoteip param. */
export function clientIpFrom(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}
