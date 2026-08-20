import { describe, it, expect } from "vitest";
import { PARTY_IDLE_TIMEOUT_MS } from "./types";
import { STALE_AFTER_MS } from "@/lib/presence/types";

/**
 * How long a party outlives the people in it.
 *
 * This is the backstop, not the main mechanism — dropOfflinePartyMembers
 * normally clears a party within about three minutes of everyone going quiet.
 * At four hours the backstop was long enough that a party nobody was in still
 * appeared in friends-playing and party lists, which read as stuck rather than
 * expiring.
 */

describe("party idle timeout", () => {
  it("is fifteen minutes", () => {
    expect(PARTY_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });

  it("comfortably outlasts a stale presence, so a reconnect is survivable", () => {
    /*
     * Presence goes stale after two minutes. If the idle timeout were close to
     * that, a launcher restart or a brief network drop would end a party
     * someone was still sitting in.
     */
    expect(PARTY_IDLE_TIMEOUT_MS).toBeGreaterThan(STALE_AFTER_MS * 5);
  });

  it("is short enough that a dead party does not look permanent", () => {
    // The failure being fixed: four hours of a party nobody was in.
    expect(PARTY_IDLE_TIMEOUT_MS).toBeLessThanOrEqual(30 * 60 * 1000);
  });
});
