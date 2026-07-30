const BLOCKED_DOMAINS = [
  "bit.ly",
  "tinyurl.com",
  "t.me",
  "telegram.me",
  "discord.gg/nitro",
  "free-nitro",
  "steamcommunity.com/gift",
  "steampowered.com/gift",
];

const PROFANITY =
  /\b(nigger|nigga|faggot|kike|retard|rape\b|raping)\b/i;

const HTML_TAG = /<\/?[a-z][\s\S]*?>/gi;
const URL_RE = /https?:\/\/[^\s)>\]]+/i;

export const TITLE_MAX = 150;
export const BODY_MAX = 10000;
export const BODY_MIN = 5;
export const TITLE_MIN = 3;
export const TAG_MAX = 8;
export const TAG_LEN = 24;

export type SanitizeResult =
  | { ok: true; title?: string; body: string; tags: string[] }
  | { ok: false; error: string };

function stripHtml(input: string): string {
  return input.replace(HTML_TAG, "");
}

function findBlockedDomain(text: string): string | null {
  const lower = text.toLowerCase();
  for (const d of BLOCKED_DOMAINS) {
    if (lower.includes(d)) return d;
  }
  return null;
}

export function containsUrl(text: string): boolean {
  return URL_RE.test(text);
}

export function accountAllowsLinks(createdAt: Date | string | undefined): boolean {
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs >= 24 * 60 * 60 * 1000;
}

export function sanitizeTopicInput(input: {
  title: string;
  body: string;
  tags?: string[];
  allowLinks: boolean;
}): SanitizeResult {
  const title = stripHtml(input.title).trim().slice(0, TITLE_MAX);
  const body = stripHtml(input.body).trim().slice(0, BODY_MAX);
  const tags = (input.tags ?? [])
    .map((t) => stripHtml(String(t)).trim().toLowerCase().slice(0, TAG_LEN))
    .filter(Boolean)
    .slice(0, TAG_MAX);

  if (title.length < TITLE_MIN) return { ok: false, error: "Title is too short." };
  if (body.length < BODY_MIN) return { ok: false, error: "Body is too short." };
  if (PROFANITY.test(title) || PROFANITY.test(body)) {
    return { ok: false, error: "Content violates community guidelines." };
  }
  const blocked = findBlockedDomain(`${title}\n${body}`);
  if (blocked) {
    return { ok: false, error: "Link domain is not allowed." };
  }
  if (!input.allowLinks && (containsUrl(title) || containsUrl(body))) {
    return {
      ok: false,
      error: "New accounts cannot post links for the first 24 hours.",
    };
  }
  return { ok: true, title, body, tags };
}

export function sanitizeReplyInput(input: {
  body: string;
  allowLinks: boolean;
}): SanitizeResult {
  const body = stripHtml(input.body).trim().slice(0, BODY_MAX);
  if (body.length < BODY_MIN) return { ok: false, error: "Reply is too short." };
  if (PROFANITY.test(body)) {
    return { ok: false, error: "Content violates community guidelines." };
  }
  const blocked = findBlockedDomain(body);
  if (blocked) {
    return { ok: false, error: "Link domain is not allowed." };
  }
  if (!input.allowLinks && containsUrl(body)) {
    return {
      ok: false,
      error: "New accounts cannot post links for the first 24 hours.",
    };
  }
  return { ok: true, body, tags: [] };
}
