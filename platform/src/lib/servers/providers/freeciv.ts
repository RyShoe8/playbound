import { attachGeo } from "../geo";
import type { GameServer } from "../types";
import { MAX_SERVERS } from "../types";

/**
 * Freeciv public games from the official metaserver HTML listing.
 * https://meta.freeciv.org/
 */

const META_URL = "https://meta.freeciv.org/";

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIntSafe(raw: string | undefined, fallback: number | null = null): number | null {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/** Extract table rows; Freeciv meta uses Host | Port | … | Players | Message. */
export function parseFreecivMetaserverHtml(html: string): GameServer[] {
  const rows: GameServer[] = [];
  const seen = new Set<string>();
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(html)) !== null) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripTags(m[1] || "")
    );
    if (cells.length < 6) continue;
    // Skip header
    if (/^host$/i.test(cells[0] || "") || /^port$/i.test(cells[1] || "")) continue;

    const host = (cells[0] || "").trim();
    const port = parseIntSafe(cells[1], null);
    if (!host || port == null || port <= 0) continue;
    if (!/^[\w.%-]+$/.test(host) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) continue;

    // Typical columns: Host Port Version Patches State Players Message …
    // Prefer human players when present; else Players column.
    const players =
      parseIntSafe(cells[8], null) ?? // Human Players (when present)
      parseIntSafe(cells[5], 0) ??
      0;
    const message = cells[6] || cells[7] || "";
    const state = cells[4] || null;
    const id = `${host}:${port}`;
    if (seen.has(id)) continue;
    seen.add(id);

    rows.push({
      id,
      name: message.trim() || id,
      host,
      port,
      players: players ?? 0,
      maxPlayers: parseIntSafe(cells[7], null) ?? parseIntSafe(cells[6], null),
      map: state,
      gameType: cells[2] || "Freeciv",
      location: null,
      protected: false,
    });
  }
  return rows;
}

export async function fetchFreecivServers(): Promise<GameServer[]> {
  const res = await fetch(META_URL, {
    headers: { "user-agent": "PlayBound/1.0", accept: "text/html" },
    next: { revalidate: 45 },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Freeciv metaserver returned ${res.status}`);
  const html = await res.text();
  const mapped = parseFreecivMetaserverHtml(html);
  mapped.sort((a, b) => (b.players ?? -1) - (a.players ?? -1) || a.name.localeCompare(b.name));
  return attachGeo(mapped.slice(0, MAX_SERVERS));
}
