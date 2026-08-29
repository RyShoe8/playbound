import { estimateLatencyMs } from "./latencyEstimate";
import type { GameServer } from "./types";

/**
 * Which server "Join Multiplayer" should drop someone into.
 *
 * The button exists to remove a decision, so this has to make the same choice a
 * player would make if they read the whole list — which is not "the closest"
 * and not "the fullest".
 *
 * A nearly empty server is a lobby you sit alone in, and a full one has no slot
 * to take, so the population window is bounded at both ends: at least a quarter
 * full to be worth joining, and never completely full. Within that, the target
 * is three-quarters full — a game that is clearly happening but still has room
 * for you and a friend — so servers are ranked by distance from that mark
 * rather than by raw player count, and a 90%-full server loses to a 75% one.
 *
 * Latency is a hard cut rather than part of the ranking. Past about 100ms most
 * of these games stop feeling right no matter how good the population is, and
 * a button that promises a good game should not hand someone a bad one because
 * it was busy.
 */

/** At least this full to be worth joining. */
export const MIN_OCCUPANCY = 0.25;
/** The sweet spot: busy, with room left. */
export const TARGET_OCCUPANCY = 0.75;
/** Above this, treat as unplayable regardless of population. */
export const MAX_LATENCY_MS = 100;

export type ViewerLocation = { lat: number; lon: number } | null;

export type ServerPick = {
  server: GameServer;
  players: number;
  maxPlayers: number;
  occupancy: number;
  /** Estimated, not measured — see latencyEstimate. */
  latencyMs: number;
};

/**
 * Estimated round trip to a server, or null when it cannot be estimated.
 *
 * Null rather than a default, because a guessed latency would be indisting-
 * uishable from a measured one at the point where the 100ms cut is applied,
 * and the whole promise of the button is that it does not send you somewhere
 * bad.
 */
export function serverLatencyMs(server: GameServer, viewer: ViewerLocation): number | null {
  if (!viewer) return null;
  const lat = server.location?.lat;
  const lon = server.location?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return null;
  return estimateLatencyMs(viewer.lat, viewer.lon, lat, lon);
}

/** Every server that passes the population and latency gates, best first. */
export function rankJoinableServers(
  servers: GameServer[],
  viewer: ViewerLocation
): ServerPick[] {
  const picks: ServerPick[] = [];

  for (const server of servers) {
    const players = Number(server.players);
    const maxPlayers = Number(server.maxPlayers);
    // A provider that does not report both numbers cannot be judged on
    // population, and guessing is how someone lands in an empty server.
    if (!Number.isFinite(players) || !Number.isFinite(maxPlayers)) continue;
    if (maxPlayers <= 0 || players < 0) continue;

    const occupancy = players / maxPlayers;
    if (occupancy < MIN_OCCUPANCY) continue;
    // No slot to take. Also covers providers that report more players than
    // slots, which happens with spectators.
    if (players >= maxPlayers) continue;

    // Password-protected servers are not somewhere a one-click join can go.
    if (server.protected) continue;

    const latencyMs = serverLatencyMs(server, viewer);
    if (latencyMs === null || latencyMs > MAX_LATENCY_MS) continue;

    picks.push({ server, players, maxPlayers, occupancy, latencyMs });
  }

  return picks.sort((a, b) => {
    const aTarget = Math.abs(a.occupancy - TARGET_OCCUPANCY);
    const bTarget = Math.abs(b.occupancy - TARGET_OCCUPANCY);
    // Bucketed so a trivial occupancy difference does not outrank a much
    // better connection — two servers within 5 points of each other are
    // "equally busy" and latency decides.
    const bucket = Math.round(aTarget * 20) - Math.round(bTarget * 20);
    if (bucket !== 0) return bucket;
    if (a.latencyMs !== b.latencyMs) return a.latencyMs - b.latencyMs;
    // Stable for equal candidates, so the same click gives the same server.
    return a.server.id.localeCompare(b.server.id);
  });
}

/** The one to join, or null when nothing is worth joining right now. */
export function pickBestServer(
  servers: GameServer[],
  viewer: ViewerLocation
): ServerPick | null {
  return rankJoinableServers(servers, viewer)[0] ?? null;
}
