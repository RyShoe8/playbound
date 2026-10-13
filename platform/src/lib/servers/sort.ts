import type { GameServer } from "./types";

export type ServerSortKey = "name" | "players" | "map" | "location" | "est";
export type ServerSortDirection = "asc" | "desc";
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function serverLocationLabel(server: GameServer): string {
  const loc = server.location;
  if (loc?.region && loc.region.length > 2) return loc.region;
  const code = loc?.countryCode?.toUpperCase();
  return code && code !== "ZZ" && code !== "XX" ? code : "—";
}

/** Compare the displayed cell values; unavailable values stay last in either direction. */
export function compareServerRows(a: GameServer, b: GameServer, key: ServerSortKey,
  direction: ServerSortDirection, latency: (server: GameServer) => number | null): number {
  const value = (s: GameServer): string | number | null => {
    if (key === "players" || key === "est") {
      const number = key === "players" ? s.players : latency(s);
      return number != null && Number.isFinite(number) ? number : null;
    }
    if (key === "name") return [s.gameTitle, s.name].filter(Boolean).join(" ").trim() || null;
    if (key === "map") return s.map?.trim() || null;
    const location = serverLocationLabel(s);
    return location === "—" ? null : location;
  };
  const av = value(a), bv = value(b);
  if (av === null || bv === null) {
    if (av !== bv) return av === null ? 1 : -1;
  } else {
    const result = typeof av === "number" && typeof bv === "number"
      ? av - bv : collator.compare(String(av), String(bv));
    if (result) return direction === "asc" ? result : -result;
  }
  return collator.compare(a.id || `${a.host}:${a.port}`, b.id || `${b.host}:${b.port}`);
}
