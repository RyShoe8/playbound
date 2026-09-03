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

/**
 * A match outlasts the presence window, so the two have to be reconciled
 * somewhere. They are reconciled by dropOfflinePartyMembers skipping parties
 * that are launching or playing — these assertions are why that is necessary
 * rather than cautious.
 */
describe("presence during a match", () => {
  it("is judged on a window shorter than a game", () => {
    // Two missed 60s beats and a player reads as gone. Matches run for tens of
    // minutes, and the launcher is behind a fullscreen window for all of it.
    expect(STALE_AFTER_MS).toBe(2 * 60 * 1000);
    expect(STALE_AFTER_MS).toBeLessThan(20 * 60 * 1000);
  });

  it("leaves the idle sweep as the backstop for a machine that really died", () => {
    /*
     * Skipping in-session parties would strand one forever if the timeout did
     * not still catch it. Fifteen minutes of no activity ends a party whatever
     * its status, so a PC that dies mid-match is cleaned up either way.
     */
    expect(PARTY_IDLE_TIMEOUT_MS).toBeGreaterThan(STALE_AFTER_MS);
    expect(PARTY_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });
});
