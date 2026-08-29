import { describe, it, expect } from "vitest";
import {
  pickBestServer,
  rankJoinableServers,
  MIN_OCCUPANCY,
  TARGET_OCCUPANCY,
  MAX_LATENCY_MS,
} from "./pickBestServer";
import type { GameServer } from "./types";

/**
 * "Join Multiplayer" removes a decision from the player, so the cost of being
 * wrong is higher than for a list they can scan: they get dropped somewhere
 * and have to work out why it was a bad game. These lock the choice.
 */

/** Chicago-ish, so distances below are deliberate. */
const VIEWER = { lat: 41.88, lon: -87.63 };
/** ~0ms away. */
const NEAR = { countryCode: "US", lat: 41.9, lon: -87.6 };
/** Far enough to blow the latency cut. */
const FAR = { countryCode: "AU", lat: -33.87, lon: 151.21 };

let n = 0;
function server(over: Partial<GameServer> = {}): GameServer {
  n += 1;
  return {
    id: over.id ?? `srv-${n}`,
    name: `Server ${n}`,
    host: "1.2.3.4",
    port: 27015,
    players: 8,
    maxPlayers: 16,
    map: null,
    gameType: null,
    location: NEAR,
    protected: false,
    ...over,
  };
}

describe("picking a server to join", () => {
  it("prefers the one nearest three-quarters full", () => {
    const quarter = server({ id: "quarter", players: 4, maxPlayers: 16 }); // 0.25
    const target = server({ id: "target", players: 12, maxPlayers: 16 }); // 0.75
    const nearlyFull = server({ id: "nearly", players: 15, maxPlayers: 16 }); // 0.94
    const best = pickBestServer([quarter, nearlyFull, target], VIEWER);
    expect(best?.server.id).toBe("target");
  });

  it("prefers busy over merely close", () => {
    // The whole point: a nearby empty lobby is not a game.
    const closeButQuiet = server({ id: "quiet", players: 4, maxPlayers: 16, location: NEAR });
    const target = server({
      id: "busy",
      players: 12,
      maxPlayers: 16,
      location: { countryCode: "US", lat: 40.71, lon: -74.0 }, // NYC, still under the cut
    });
    expect(pickBestServer([closeButQuiet, target], VIEWER)?.server.id).toBe("busy");
  });

  it("breaks an equally-busy tie on latency", () => {
    const far = server({
      id: "far",
      players: 12,
      maxPlayers: 16,
      location: { countryCode: "US", lat: 40.71, lon: -74.0 },
    });
    const near = server({ id: "near", players: 12, maxPlayers: 16, location: NEAR });
    expect(pickBestServer([far, near], VIEWER)?.server.id).toBe("near");
  });

  it("rejects servers below the population floor", () => {
    const tooQuiet = server({ players: 3, maxPlayers: 16 }); // 0.1875
    expect(pickBestServer([tooQuiet], VIEWER)).toBeNull();
    // Exactly at the floor is allowed.
    const atFloor = server({ players: 4, maxPlayers: 16 });
    expect(atFloor.players! / atFloor.maxPlayers!).toBe(MIN_OCCUPANCY);
    expect(pickBestServer([atFloor], VIEWER)).not.toBeNull();
  });

  it("rejects a full server — there is no slot to take", () => {
    expect(pickBestServer([server({ players: 16, maxPlayers: 16 })], VIEWER)).toBeNull();
    // Some providers count spectators past the cap.
    expect(pickBestServer([server({ players: 18, maxPlayers: 16 })], VIEWER)).toBeNull();
  });

  it("rejects anything past the latency cut, however busy", () => {
    const perfect = server({ players: 12, maxPlayers: 16, location: FAR });
    expect(pickBestServer([perfect], VIEWER)).toBeNull();
  });

  it("rejects a server it cannot estimate latency for", () => {
    // Unknown is not the same as fine. Without a location, or without knowing
    // where the player is, the 100ms promise cannot be kept.
    expect(pickBestServer([server({ location: null })], VIEWER)).toBeNull();
    expect(pickBestServer([server({ location: { countryCode: "US" } })], VIEWER)).toBeNull();
    expect(pickBestServer([server()], null)).toBeNull();
  });

  it("rejects password-protected servers", () => {
    expect(pickBestServer([server({ players: 12, protected: true })], VIEWER)).toBeNull();
  });

  it("ignores servers with unreported player counts", () => {
    expect(pickBestServer([server({ players: null })], VIEWER)).toBeNull();
    expect(pickBestServer([server({ maxPlayers: null })], VIEWER)).toBeNull();
    expect(pickBestServer([server({ maxPlayers: 0 })], VIEWER)).toBeNull();
  });

  it("returns null rather than a bad server when nothing qualifies", () => {
    // The button hides itself instead of promising a good game it cannot find.
    expect(pickBestServer([], VIEWER)).toBeNull();
    expect(
      pickBestServer([server({ players: 1, maxPlayers: 32 }), server({ location: FAR })], VIEWER)
    ).toBeNull();
  });

  it("is stable — the same click gives the same server", () => {
    const a = server({ id: "aaa", players: 12, maxPlayers: 16 });
    const b = server({ id: "bbb", players: 12, maxPlayers: 16 });
    expect(pickBestServer([a, b], VIEWER)?.server.id).toBe(
      pickBestServer([b, a], VIEWER)?.server.id
    );
  });

  it("ranks every qualifying server, best first", () => {
    const ranked = rankJoinableServers(
      [
        server({ id: "low", players: 4, maxPlayers: 16 }),
        server({ id: "target", players: 12, maxPlayers: 16 }),
        server({ id: "rejected", players: 1, maxPlayers: 16 }),
      ],
      VIEWER
    );
    expect(ranked.map((r) => r.server.id)).toEqual(["target", "low"]);
    expect(ranked[0].occupancy).toBeCloseTo(TARGET_OCCUPANCY);
    expect(ranked[0].latencyMs).toBeLessThanOrEqual(MAX_LATENCY_MS);
  });
});
