/**
 * Reads the {{Video game reviews}} table out of a Wikipedia article.
 *
 * That template is the closest thing to a neutral, public critic aggregate:
 * editors list every outlet that reviewed the game, good or bad, each with the
 * published score and a citation that links to the review itself. Developer
 * press quotes (a Steam page's "what critics say") are cherry-picked, so they
 * are deliberately not a source for the Editorial Rating.
 *
 * Pure string work, no network, so it is tested against real wikitext.
 */

export interface ParsedReview {
  outlet: string;
  url: string;
  /** The outlet's score as stored: the number and what it is out of. */
  score: number | null;
  scoreMax: number | null;
  /** The score as printed when it is not a plain number (a letter grade). */
  scoreText: string | null;
  author: string | null;
  publishedAt: Date | null;
  /** Template parameter it came from, for debugging a bad row. */
  key: string;
}

/** Aggregators are not reviews; the rating must not average other averages. */
const AGGREGATOR_KEYS = new Set(["MC", "GR", "OC", "MCp", "GRp"]);

/** Template abbreviations → outlet names, used when a citation names no work. */
const OUTLET_CODES: Record<string, string> = {
  "1UP": "1Up.com",
  ACE: "ACE",
  AllGame: "AllGame",
  Allgame: "AllGame",
  AppSpy: "AppSpy",
  CGW: "Computer Gaming World",
  CVG: "Computer and Video Games",
  Destruct: "Destructoid",
  Destructoid: "Destructoid",
  Edge: "Edge",
  EGM: "Electronic Gaming Monthly",
  EuroG: "Eurogamer",
  Fam: "Famitsu",
  G4: "G4",
  GameFan: "GameFan",
  GameMe: "GameMe",
  GamePro: "GamePro",
  GameRev: "GameRevolution",
  GB: "Giant Bomb",
  GI: "Game Informer",
  GSpot: "GameSpot",
  GSpy: "GameSpy",
  GameSpy: "GameSpy",
  GT: "GameTrailers",
  GameZone: "GameZone",
  Hyper: "Hyper",
  IGN: "IGN",
  Jeuxvideo: "Jeuxvideo.com",
  MMore: "MeriStation",
  NLife: "Nintendo Life",
  NP: "Nintendo Power",
  NWR: "Nintendo World Report",
  OPM: "Official PlayStation Magazine",
  OXM: "Official Xbox Magazine",
  PCGUS: "PC Gamer (US)",
  PCGUK: "PC Gamer (UK)",
  PCGamer: "PC Gamer",
  PCZone: "PC Zone",
  Play: "Play",
  Poly: "Polygon",
  PSM: "PlayStation Magazine",
  RPS: "Rock Paper Shotgun",
  TouchArcade: "TouchArcade",
  VG247: "VG247",
};

/** Letter grades the way the major aggregators convert them. */
const LETTER_GRADES: Record<string, number> = {
  "A+": 100, A: 95, "A-": 91, "B+": 87, B: 83, "B-": 80, "C+": 75, C: 70, "C-": 67, "D+": 62, D: 58, "D-": 54, F: 0,
};

/** The {{...}} block starting at `start`, braces balanced. */
function balancedTemplate(text: string, start: number): string | null {
  let depth = 0;
  for (let i = start; i < text.length - 1; i++) {
    if (text[i] === "{" && text[i + 1] === "{") {
      depth++;
      i++;
    } else if (text[i] === "}" && text[i + 1] === "}") {
      depth--;
      i++;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Split template parameters on top-level pipes only. */
function splitParams(body: string): string[] {
  const out: string[] = [];
  let cur = "";
  let braces = 0;
  let brackets = 0;
  let inRef = false;
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (body.slice(i, i + 4).toLowerCase() === "<ref" && !/^<ref[^>]*\/>/i.test(body.slice(i, i + 200))) inRef = true;
    if (body.slice(i, i + 6).toLowerCase() === "</ref>") inRef = false;
    if (two === "{{") braces++;
    if (two === "}}") braces--;
    if (two === "[[") brackets++;
    if (two === "]]") brackets--;
    if (body[i] === "|" && braces === 0 && brackets === 0 && !inRef) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += body[i];
  }
  out.push(cur);
  return out;
}

/** [[Target|Label]] → Label, ''italics'' removed, tags dropped. */
export function plainText(s: string): string {
  return s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Named citation fields from a {{cite ...}} body. */
function citeFields(cite: string): Record<string, string> {
  const inner = cite.replace(/^\{\{\s*cite[^|]*\|?/i, "").replace(/\}\}$/, "");
  const fields: Record<string, string> = {};
  for (const part of splitParams(inner)) {
    const m = part.match(/^\s*([\w-]+)\s*=\s*([\s\S]*)$/);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
  }
  return fields;
}

/** Every named <ref name="x">…</ref> in the article, for resolving <ref name="x"/>. */
export function namedRefs(article: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<ref\s+name\s*=\s*"?([^">/]+?)"?\s*>([\s\S]*?)<\/ref>/gi;
  for (const m of article.matchAll(re)) if (!map.has(m[1].trim())) map.set(m[1].trim(), m[2]);
  return map;
}

function refBodies(value: string, refs: Map<string, string>): string[] {
  const bodies: string[] = [];
  for (const m of value.matchAll(/<ref(?:\s+name\s*=\s*"?([^">/]+?)"?)?\s*(\/>|>([\s\S]*?)<\/ref>)/gi)) {
    if (m[3] != null) bodies.push(m[3]);
    else if (m[1] && refs.has(m[1].trim())) bodies.push(refs.get(m[1].trim())!);
  }
  return bodies;
}

const DEAD_STATUS = /^(dead|unfit|usurped|yes)$/i;

function citationFrom(body: string) {
  const cite = body.match(/\{\{\s*cite[\s\S]*\}\}/i)?.[0];
  if (!cite) return null;
  const f = citeFields(cite);
  const dead = DEAD_STATUS.test(f["url-status"] ?? "") || /^(yes|true)$/i.test(f["deadurl"] ?? f["dead-url"] ?? "");
  const archive = f["archive-url"] ?? f["archiveurl"] ?? null;
  const url = dead && archive ? archive : (f.url ?? archive);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const work = f.work ?? f.website ?? f.magazine ?? f.newspaper ?? f.publisher ?? null;
  const author =
    f.author ?? f.author1 ?? (f.last || f.last1 ? [f.first ?? f.first1, f.last ?? f.last1].filter(Boolean).join(" ") : null);
  const d = f.date ? new Date(plainText(f.date)) : null;
  // "Goldman, Alexander" → "Alexander Goldman"; multi-author strings are left alone.
  const name = author ? plainText(author) : null;
  const flipped = name && /^[^,]+,\s*[^,]+$/.test(name) ? name.replace(/^([^,]+),\s*(.+)$/, "$2 $1") : name;
  return {
    url: url.trim(),
    work: work ? plainText(work) : null,
    author: flipped,
    publishedAt: d && !Number.isNaN(d.getTime()) ? d : null,
  };
}

/** "8/10", "4.5/5", "85%", {{Rating|4|5}}, or a letter grade. */
export function parseScore(raw: string): { score: number | null; scoreMax: number | null; scoreText: string | null } {
  const text = raw.replace(/<ref[\s\S]*?(<\/ref>|\/>)/gi, "").trim();
  const rating = text.match(/\{\{\s*rating\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i);
  if (rating) return { score: Number(rating[1]), scoreMax: Number(rating[2]), scoreText: null };
  const clean = plainText(text);
  const frac = clean.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (frac) {
    const score = Number(frac[1]);
    const scoreMax = Number(frac[2]);
    if (Number.isFinite(score) && Number.isFinite(scoreMax) && scoreMax > 0 && score <= scoreMax) return { score, scoreMax, scoreText: null };
  }
  const pct = clean.match(/^([\d.]+)\s*%/);
  if (pct && Number(pct[1]) <= 100) return { score: Number(pct[1]), scoreMax: 100, scoreText: null };
  const letter = clean.match(/^([A-DF][+-]?)(?![\w])/);
  if (letter && letter[1] in LETTER_GRADES) return { score: LETTER_GRADES[letter[1]], scoreMax: 100, scoreText: letter[1] };
  return { score: null, scoreMax: null, scoreText: null };
}

/**
 * Several platforms can share a row ("PC: 8/10<br>PS4: 7/10"). PlayBound is
 * a PC catalog, so the PC score wins; otherwise the first one listed.
 */
function pickPlatformSegment(value: string): string {
  const segments = value.split(/<br\s*\/?>|\n\*/i).map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) return value;
  return segments.find((s) => /\b(PC|WIN|Windows)\b/.test(s)) ?? segments[0];
}

/** The value of one top-level template parameter, nested templates included. */
function templateParam(template: string, name: string): string | null {
  const m = new RegExp(`\\|\\s*${name}\\s*=`, "i").exec(template);
  if (!m) return null;
  let depth = 0;
  let i = m.index + m[0].length;
  const start = i;
  for (; i < template.length; i++) {
    const two = template.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      i++;
    } else if (two === "}}" || two === "]]") {
      if (depth === 0) break;
      depth--;
      i++;
    } else if (template[i] === "|" && depth === 0) break;
  }
  return template.slice(start, i);
}

/** Whether the article's infobox lists a release in this year (±1 for regional/early access). */
export function releasedAround(article: string, year: number): boolean {
  const start = article.search(/\{\{\s*Infobox video game/i);
  if (start < 0) return false;
  const box = balancedTemplate(article, start) ?? "";
  const released = templateParam(box.slice(2, -2), "released") ?? "";
  const years = [...released.matchAll(/\b(19[7-9]\d|20\d\d)\b/g)].map((m) => Number(m[1]));
  return years.some((y) => Math.abs(y - year) <= 1);
}

export function hasReviewsTable(article: string): boolean {
  return /\{\{\s*Video game reviews/i.test(article);
}

export function isVideoGameArticle(article: string): boolean {
  return /\{\{\s*Infobox video game/i.test(article);
}

/** Every review row with a link, from the article's first reviews table. */
export function parseVideoGameReviews(article: string): ParsedReview[] {
  const start = article.search(/\{\{\s*Video game reviews/i);
  if (start < 0) return [];
  const tpl = balancedTemplate(article, start);
  if (!tpl) return [];
  const refs = namedRefs(article);
  const params = new Map<string, string>();
  for (const part of splitParams(tpl.slice(2, -2)).slice(1)) {
    const m = part.match(/^\s*([\w-]+)\s*=\s*([\s\S]*)$/);
    if (m && m[2].trim()) params.set(m[1].trim(), m[2].trim());
  }

  // Multi-platform tables suffix each outlet with a platform ("GSpot_PC",
  // "Edge_PS4"). Keep one score per outlet: the PC column when there is one,
  // otherwise the first listed, and treat it like a single-column row.
  const byOutlet = new Map<string, string>();
  for (const [key, value] of params) {
    const m = key.match(/^(\w+?)_([A-Za-z0-9]+)$/);
    if (!m) continue;
    const known = m[1] in OUTLET_CODES || AGGREGATOR_KEYS.has(m[1]) || /^rev\d+(Score)?$/i.test(m[1]);
    if (!known) continue;
    const base = m[1];
    const isPc = /^(PC|WIN)$/i.test(m[2]);
    if (!byOutlet.has(base) || isPc) byOutlet.set(base, value);
  }
  for (const [base, value] of byOutlet) if (!params.has(base)) params.set(base, value);

  const rows: { key: string; name: string | null; value: string }[] = [];
  for (const [key, value] of params) {
    if (AGGREGATOR_KEYS.has(key)) continue;
    const custom = key.match(/^rev(\d+)$/i);
    if (custom) {
      const scoreValue = params.get(`rev${custom[1]}Score`) ?? params.get(`rev${custom[1]}score`);
      if (scoreValue) rows.push({ key, name: plainText(value), value: scoreValue });
      continue;
    }
    if (/^rev\d+score$/i.test(key)) continue;
    if (key in OUTLET_CODES) rows.push({ key, name: OUTLET_CODES[key], value });
  }

  const out: ParsedReview[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const segment = pickPlatformSegment(row.value);
    const bodies = refBodies(segment, refs);
    const allBodies = bodies.length ? bodies : refBodies(row.value, refs);
    const cite = allBodies.map(citationFrom).find(Boolean);
    if (!cite || seen.has(cite.url)) continue;
    seen.add(cite.url);
    const scoreSource = segment.replace(/^[^:]{1,20}:\s*/, "");
    out.push({
      key: row.key,
      // A custom row names the outlet itself; a coded row's citation is more
      // specific than the template's abbreviation ("PC Gamer UK").
      outlet: (/^rev\d+$/i.test(row.key) ? row.name : (cite.work ?? row.name)) || cite.work || row.key,
      url: cite.url,
      ...parseScore(scoreSource),
      author: cite.author,
      publishedAt: cite.publishedAt,
    });
  }
  return out;
}
