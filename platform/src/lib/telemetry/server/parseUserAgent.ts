/**
 * Lightweight User-Agent parsing — no extra dependency.
 */

export interface ParsedUserAgent {
  browser: string;
  os: string;
  device: string;
}

/** Display names for the platform tokens the launcher reports. */
const LAUNCHER_OS: Record<string, string> = {
  windows: "Windows",
  win32: "Windows",
  macos: "macOS",
  darwin: "macOS",
  linux: "Linux",
};

/**
 * The desktop app's own User-Agent, e.g.
 * `playbound-launcher/0.2.12 (windows; x64)`.
 *
 * It carries no browser token and spells the platform in lowercase without
 * "Windows NT", so the browser rules below all miss and the OS rules only ever
 * matched Linux, by accident. Every launcher event was landing as
 * "unknown · unknown · desktop". Parsed here instead, before the browser
 * heuristics get a chance to guess.
 */
/** Display name for a launcher `platform` value, or null if unrecognised. */
export function launcherOsLabel(platform: unknown): string | null {
  if (typeof platform !== "string" || !platform.trim()) return null;
  const token = platform.trim().toLowerCase();
  return LAUNCHER_OS[token] || token;
}

export function parseLauncherUserAgent(raw: string): ParsedUserAgent | null {
  const match = raw.match(/^playbound-launcher\/\S+\s*\(([^;)]+)/i);
  if (!match) return null;
  const token = match[1].trim().toLowerCase();
  return {
    browser: "Launcher",
    os: LAUNCHER_OS[token] || token || "unknown",
    device: "desktop",
  };
}

const BOT_PATTERN =
  /\b(bot|crawler|spider|scraper|slurp|headless|phantom|puppeteer|playwright|selenium|wget|curl|python-requests|node-fetch|axios|postman|bytespider|gptbot|claudebot|perplexity|semrush|ahrefs|mj12bot|dotbot|googlebot|bingbot|yandexbot|duckduckbot|baiduspider)\b/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const raw = (ua || "").trim();
  if (!raw) return true;
  if (BOT_PATTERN.test(raw)) return true;
  return false;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const raw = (ua || "").trim();
  if (!raw) {
    return { browser: "unknown", os: "unknown", device: "unknown" };
  }

  const launcher = parseLauncherUserAgent(raw);
  if (launcher) return launcher;

  let os = "unknown";
  if (/Windows NT/i.test(raw)) os = "Windows";
  // iOS before macOS: an iPhone's agent says "like Mac OS X", so the macOS
  // rule matched first and every iPhone was recorded as a Mac. (An iPad on
  // iPadOS 13+ genuinely claims "Macintosh" and is not distinguishable here.)
  else if (/iPhone|iPad|iPod/i.test(raw)) os = "iOS";
  // Android before Linux for the same reason — Android agents say "Linux".
  else if (/Android/i.test(raw)) os = "Android";
  else if (/Mac OS X|Macintosh/i.test(raw)) os = "macOS";
  else if (/CrOS/i.test(raw)) os = "Chrome OS";
  else if (/Linux/i.test(raw)) os = "Linux";

  let browser = "unknown";
  if (/Edg\//i.test(raw)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(raw)) browser = "Opera";
  else if (/Chrome\//i.test(raw) && !/Edg\//i.test(raw)) browser = "Chrome";
  else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw)) browser = "Safari";
  else if (/Firefox\//i.test(raw)) browser = "Firefox";
  else if (/MSIE|Trident\//i.test(raw)) browser = "IE";
  else if (BOT_PATTERN.test(raw)) browser = "Bot";

  let device = "desktop";
  if (/iPad|Tablet/i.test(raw)) device = "tablet";
  else if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(raw)) device = "mobile";

  return { browser, os, device };
}
