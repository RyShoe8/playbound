import dbConnect from "@/lib/db";
import DeveloperModel from "@/lib/models/Developer";
import { listAllDevelopers } from "@/lib/developers";
import { FEATURES, GENRES, slugifyTitle } from "@/lib/gamePayload";
import { stripHtml } from "@/lib/pageMeta";

export type ResolvedDeveloper = {
  slug: string;
  name: string;
  /** True when a new published developer document was inserted. */
  created: boolean;
};

const GENRE_SET = new Set<string>(GENRES);
const FEATURE_SET = new Set<string>(FEATURES);

/** Steam / free-text genre strings → closed PlayBound GENRES + leftover tags. */
const GENRE_ALIASES: Record<string, (typeof GENRES)[number]> = {
  strategy: "Strategy",
  "real-time strategy": "RTS",
  rts: "RTS",
  fps: "FPS",
  "first-person shooter": "FPS",
  shooter: "Shooter",
  racing: "Racing",
  puzzle: "Puzzle",
  rpg: "RPG",
  "role-playing": "RPG",
  "role playing": "RPG",
  "action rpg": "RPG",
  roguelike: "Roguelike",
  roguelite: "Roguelike",
  simulation: "Simulation",
  sim: "Simulation",
  platformer: "Platformer",
  platform: "Platformer",
  sandbox: "Sandbox",
  "tower defense": "Tower Defense",
  "tower defence": "Tower Defense",
  space: "Space",
  arcade: "Arcade",
  casual: "Arcade",
  pirate: "Pirate",
  mmo: "MMO",
  mmorpg: "MMO",
  "massively multiplayer": "MMO",
  sports: "Sports",
  fighting: "Fighting",
  "social deduction": "Social Deduction",
  "card game": "Card Game",
  ccg: "Card Game",
  idle: "Idle",
  incremental: "Idle",
  clicker: "Idle",
  moba: "MOBA",
  // Epic store-content meta.tags (humanized SCREAMING_SNAKE)
  action: "Action",
  adventure: "Adventure",
  exploration: "Sandbox",
  horror: "Horror",
  survival: "Survival",
  open: "Sandbox",
  "open world": "Sandbox",
};

/** Steam category descriptions → closed FEATURES. */
const FEATURE_ALIASES: Record<string, (typeof FEATURES)[number]> = {
  multiplayer: "Multiplayer",
  "multi-player": "Multiplayer",
  "online pvp": "Multiplayer",
  "online multi-player": "Multiplayer",
  "online multiplayer": "Multiplayer",
  "single-player": "Singleplayer",
  singleplayer: "Singleplayer",
  "single player": "Singleplayer",
  "co-op": "Co-op",
  coop: "Co-op",
  "online co-op": "Co-op",
  "local co-op": "Co-op",
  "shared/split screen": "Split-Screen Co-op",
  "shared/split screen co-op": "Split-Screen Co-op",
  "split screen": "Split-Screen Co-op",
  "remote play together": "Split-Screen Co-op",
  hotseat: "Hotseat",
  "lan support": "LAN Support",
  "local multi-player": "LAN Support",
  "cross-platform multiplayer": "Cross-play",
  "cross play": "Cross-play",
  "cross-play": "Cross-play",
  "full controller support": "Controller Support",
  "partial controller support": "Controller Support",
  "controller support": "Controller Support",
  "steam workshop": "Mod Support",
  "includes level editor": "Level Editor",
  "includes level editing tools": "Map Editor",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function mapLabelsToGenresAndTags(labels: string[]): {
  genres: string[];
  tags: string[];
} {
  const genres: string[] = [];
  const tags: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    if (GENRE_SET.has(label) && !genres.includes(label)) {
      genres.push(label);
      continue;
    }
    const mapped = GENRE_ALIASES[normalizeKey(label)];
    if (mapped && !genres.includes(mapped)) {
      genres.push(mapped);
      continue;
    }
    if (!tags.includes(label)) tags.push(label);
  }
  return { genres: genres.slice(0, 8), tags: tags.slice(0, 16) };
}

export function mapLabelsToFeatures(labels: string[]): string[] {
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    if (FEATURE_SET.has(label) && !out.includes(label)) {
      out.push(label);
      continue;
    }
    const mapped = FEATURE_ALIASES[normalizeKey(label)];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out.slice(0, 16);
}

export function steamGenreLabels(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.genres)) return [];
  return (data.genres as { description?: string }[])
    .map((g) => g.description)
    .filter((x): x is string => Boolean(x));
}

export function steamCategoryLabels(data: Record<string, unknown>): string[] {
  if (!Array.isArray(data.categories)) return [];
  return (data.categories as { description?: string }[])
    .map((c) => c.description)
    .filter((x): x is string => Boolean(x));
}

/** Prefer publisher, then developer credit on the Steam store page. */
export function steamDeveloperCandidate(data: Record<string, unknown>): string | null {
  const publishers = Array.isArray(data.publishers)
    ? (data.publishers as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
    : [];
  const developers = Array.isArray(data.developers)
    ? (data.developers as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
    : [];
  return publishers[0] || developers[0] || null;
}

export function steamSupportedLanguages(data: Record<string, unknown>): string[] {
  const raw = data.supported_languages;
  if (typeof raw !== "string" || !raw.trim()) return [];
  const cleaned = stripHtml(raw)
    .replace(/\*/g, "")
    .replace(/languages with full audio support.*/i, "")
    .trim();
  return cleaned
    .split(/[,]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 40)
    .slice(0, 40);
}

export function steamDiskSizeMB(data: Record<string, unknown>): number {
  const pcReq = data.pc_requirements as { minimum?: string; recommended?: string } | string | null;
  const pcReqMin = typeof pcReq === "object" && pcReq ? pcReq.minimum || "" : "";
  const pcReqRec = typeof pcReq === "object" && pcReq ? pcReq.recommended || "" : "";
  const diskText = stripHtml(pcReqMin) + " " + stripHtml(pcReqRec);
  const diskMatch = diskText.match(
    /(\d+(?:\.\d+)?)\s*(GB|MB)\s*(?:available|free|disk|hard|storage|space)/i
  );
  if (!diskMatch) return 0;
  const val = parseFloat(diskMatch[1]);
  return diskMatch[2].toUpperCase() === "GB" ? Math.round(val * 1000) : Math.round(val);
}

export function steamReleaseYear(data: Record<string, unknown>, fallback = new Date().getFullYear()): number {
  const releaseDateStr = (data.release_date as { date?: string })?.date || "";
  const yearMatch = releaseDateStr.match(/\b(19|20)\d{2}\b/);
  return yearMatch ? parseInt(yearMatch[0], 10) : fallback;
}

export function steamPlatforms(data: Record<string, unknown>): string[] {
  const steamPlatforms = data.platforms as {
    windows?: boolean;
    mac?: boolean;
    linux?: boolean;
  } | null;
  const platforms: string[] = [];
  if (steamPlatforms?.windows) platforms.push("Windows");
  if (steamPlatforms?.mac) platforms.push("macOS");
  if (steamPlatforms?.linux) platforms.push("Linux");
  if (platforms.length === 0) platforms.push("Windows");
  return platforms;
}

function uniqueSlugCandidate(base: string, taken: Set<string>): string {
  let slug = base || "developer";
  if (slug.length < 2) slug = `dev-${slug}`.padEnd(2, "x");
  if (!taken.has(slug)) return slug;
  for (let i = 2; i < 50; i++) {
    const next = `${slug}-${i}`.slice(0, 80);
    if (!taken.has(next)) return next;
  }
  return `${slug}-${Date.now()}`.slice(0, 80);
}

/**
 * Match an existing developer by slug or case-insensitive name; otherwise create
 * a published developer so Prefill can credit the right studio immediately.
 */
export async function resolveOrCreateDeveloper(opts: {
  name: string;
  website?: string | null;
  tagline?: string | null;
}): Promise<ResolvedDeveloper | null> {
  const name = opts.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return null;

  const desiredSlug = slugifyTitle(name).slice(0, 80);
  if (!desiredSlug) return null;

  const existing = await listAllDevelopers();
  const bySlug = existing.find((d) => d.slug === desiredSlug);
  if (bySlug) return { slug: bySlug.slug, name: bySlug.name, created: false };

  const byName = existing.find((d) => d.name.trim().toLowerCase() === name.toLowerCase());
  if (byName) return { slug: byName.slug, name: byName.name, created: false };

  // Loose contains match for "OpenRA Contributors" vs "OpenRA"
  const loose = existing.find((d) => {
    const a = d.name.trim().toLowerCase();
    const b = name.toLowerCase();
    return a === b || a.includes(b) || b.includes(a);
  });
  if (loose && Math.abs(loose.name.length - name.length) <= 12) {
    return { slug: loose.slug, name: loose.name, created: false };
  }

  await dbConnect();
  // Re-check under a write lock-ish: another import may have raced.
  const clash = await DeveloperModel.findOne({
    $or: [{ slug: desiredSlug }, { name: new RegExp(`^${escapeRegex(name)}$`, "i") }],
  }).lean();
  if (clash) {
    return {
      slug: String((clash as { slug: string }).slug),
      name: String((clash as { name: string }).name),
      created: false,
    };
  }

  const taken = new Set(existing.map((d) => d.slug));
  const dbSlugs = await DeveloperModel.find({}).select("slug").lean();
  for (const row of dbSlugs) taken.add(String((row as { slug: string }).slug));
  const slug = uniqueSlugCandidate(desiredSlug, taken);

  const website =
    opts.website && /^https?:\/\/\S+$/i.test(opts.website.trim()) ? opts.website.trim() : "";

  const doc = await DeveloperModel.create({
    slug,
    name,
    tagline: (opts.tagline || "").trim().slice(0, 200),
    about: "",
    founded: 0,
    location: "",
    website,
    artHue: Math.abs(hashHue(name)) % 360,
    published: true,
  });

  return { slug: doc.slug, name: doc.name, created: true };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hashHue(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}
