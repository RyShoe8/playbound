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

  it("leaves the idle sweep as the backstop, judged on presence not mutations", () => {
    /*
     * This assertion used to read "fifteen minutes of no activity ends a party
     * whatever its status", and that sentence was the bug. lastActivity only
     * moves on a party mutation — join, ready, launch, a settings change — and
     * a match produces none of them. So every session longer than fifteen
     * minutes was ended mid-game with the status still on "playing", which is
     * the opposite of a backstop.
     *
     * The timeout is unchanged and still bounds how long a party outlives the
     * people in it. What changed is the evidence: sweepStaleParties now ends a
     * party once every member's heartbeat has gone, the same evidence
     * dropOfflinePartyMembers uses, so a machine that dies mid-match is still
     * cleaned up within the window while a match that is simply long is not.
     */
    expect(PARTY_IDLE_TIMEOUT_MS).toBeGreaterThan(STALE_AFTER_MS);
    expect(PARTY_IDLE_TIMEOUT_MS).toBe(15 * 60 * 1000);

    /*
     * The gap that makes the backstop safe: a dead machine stops beating long
     * before the sweep looks, so silence is established well within the window.
     */
    expect(PARTY_IDLE_TIMEOUT_MS - STALE_AFTER_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });
});
