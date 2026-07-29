const BREVO_API_KEY = process.env.BREVO_API_KEY;

export function newsletterListId(): number {
  const raw = process.env.BREVO_NEWSLETTER_LIST_ID;
  const n = raw ? Number(raw) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export type UpsertBrevoContactOpts = {
  email: string;
  listIds?: number[];
  attributes?: Record<string, string | number | boolean>;
};

/**
 * Create or update a Brevo contact. No-ops when BREVO_API_KEY is unset.
 * Returns true on success / duplicate handled; false on failure (never throws).
 */
export async function upsertBrevoContact(opts: UpsertBrevoContactOpts): Promise<boolean> {
  if (!BREVO_API_KEY) {
    console.warn("[brevo] BREVO_API_KEY not set — skipping contact upsert");
    return false;
  }

  const body: Record<string, unknown> = {
    email: opts.email.trim().toLowerCase(),
    updateEnabled: true,
  };
  if (opts.listIds?.length) body.listIds = opts.listIds;
  if (opts.attributes && Object.keys(opts.attributes).length) {
    body.attributes = opts.attributes;
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });

    // 201 created, 204 updated, 400 duplicate-ish still often ok with updateEnabled
    if (res.ok || res.status === 204) return true;

    const text = await res.text().catch(() => "");
    console.error(`[brevo] contact upsert failed ${res.status}:`, text.slice(0, 400));
    return false;
  } catch (err) {
    console.error("[brevo] contact upsert error:", err);
    return false;
  }
}
