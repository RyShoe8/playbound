/**
 * Vocabulary for the admin health lights.
 *
 * The lights themselves are derived from telemetry in `gameOpsHealth.ts` over
 * a rolling window. This file used to also carry a stored `opsHealth` flag
 * that failures flipped to yellow and only a human click could clear; it was
 * removed once the lights self-healed, because two sources of truth for the
 * same dot is how a board of lights stops meaning anything.
 */

export const GAME_HEALTH_STATUSES = ["green", "yellow", "red"] as const;
export type GameHealthStatus = (typeof GAME_HEALTH_STATUSES)[number];

export const GAME_HEALTH_AREAS = ["install", "party"] as const;
export type GameHealthArea = (typeof GAME_HEALTH_AREAS)[number];
