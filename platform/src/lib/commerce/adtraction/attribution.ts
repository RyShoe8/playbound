const SLUG = /^[a-z0-9][a-z0-9-]{0,159}$/;
const PREFIX = "pb-game:";
const EPI_KEYS = ["epi5", "epi4", "epi3", "epi2", "epi"] as const;

export function adtractionChannelId(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "track.adtraction.com" || url.pathname !== "/t/t") return null;
    const id = url.searchParams.get("as") || "";
    return /^\d{1,15}$/.test(id) && Number(id) > 0 ? id : null;
  } catch { return null; }
}

/** Public referral metadata only: never include an account/user ID or the API token. */
export function withAdtractionGameReference(raw: string, gameSlug?: string | null): string {
  if (!gameSlug || !SLUG.test(gameSlug) || !adtractionChannelId(raw)) return raw;
  const url = new URL(raw);
  const ownKey = EPI_KEYS.find((key) => url.searchParams.get(key)?.startsWith(PREFIX));
  const key = ownKey || EPI_KEYS.find((key) => !url.searchParams.get(key));
  if (!key) return raw; // Preserve a store's existing attribution fields.
  url.searchParams.set(key, `${PREFIX}${gameSlug}`);
  return url.toString();
}

export function gameFromAdtractionClick(click: Record<string, unknown>): string | null {
  const matches = new Set(EPI_KEYS.flatMap((key) => {
    const value = click[key];
    if (typeof value !== "string" || !value.startsWith(PREFIX)) return [];
    const slug = value.slice(PREFIX.length);
    return SLUG.test(slug) ? [slug] : [];
  }));
  return matches.size === 1 ? [...matches][0] : null;
}
