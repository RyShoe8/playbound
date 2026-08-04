/**
 * Lightweight User-Agent parsing — no extra dependency.
 */

export interface ParsedUserAgent {
  browser: string;
  os: string;
  device: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const raw = (ua || "").trim();
  if (!raw) {
    return { browser: "unknown", os: "unknown", device: "unknown" };
  }

  let os = "unknown";
  if (/Windows NT/i.test(raw)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(raw)) os = "macOS";
  else if (/Android/i.test(raw)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(raw)) os = "iOS";
  else if (/Linux/i.test(raw)) os = "Linux";
  else if (/CrOS/i.test(raw)) os = "Chrome OS";

  let browser = "unknown";
  if (/Edg\//i.test(raw)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(raw)) browser = "Opera";
  else if (/Chrome\//i.test(raw) && !/Edg\//i.test(raw)) browser = "Chrome";
  else if (/Safari\//i.test(raw) && !/Chrome\//i.test(raw)) browser = "Safari";
  else if (/Firefox\//i.test(raw)) browser = "Firefox";
  else if (/MSIE|Trident\//i.test(raw)) browser = "IE";

  let device = "desktop";
  if (/iPad|Tablet/i.test(raw)) device = "tablet";
  else if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(raw)) device = "mobile";

  return { browser, os, device };
}
