/**
 * Whether a game supports Gamepads, Controllers, or Flightsticks — one answer in one place.
 */

const CONTROLLER_PATTERNS: readonly RegExp[] = [
  /\bcontroller\b/i,
  /\bgamepad\b/i,
  /\bflightstick\b/i,
  /\bhotas\b/i,
  /\bjoystick\b/i,
  /\bwheel\b/i,
];

const FLIGHTSTICK_PATTERNS: readonly RegExp[] = [
  /\bflightstick\b/i,
  /\bhotas\b/i,
  /\bflight\s*stick\b/i,
  /\bjoystick\b/i,
];

export type ControllerInput = {
  features?: string[];
  tags?: string[];
  hasControllerSupport?: boolean;
  hasFlightstickSupport?: boolean;
};

/**
 * Returns true if the game supports controllers, gamepads, or flightsticks.
 */
export function supportsController(game: ControllerInput | null | undefined): boolean {
  if (!game) return false;
  if (typeof game.hasControllerSupport === "boolean") return game.hasControllerSupport;
  const haystack = [...(game.features ?? []), ...(game.tags ?? [])].join(" | ");
  return CONTROLLER_PATTERNS.some((pattern) => pattern.test(haystack));
}

/**
 * Returns true if the game explicitly supports flightsticks or HOTAS hardware.
 */
export function supportsFlightstick(game: ControllerInput | null | undefined): boolean {
  if (!game) return false;
  if (typeof game.hasFlightstickSupport === "boolean") return game.hasFlightstickSupport;
  const haystack = [...(game.features ?? []), ...(game.tags ?? [])].join(" | ");
  return FLIGHTSTICK_PATTERNS.some((pattern) => pattern.test(haystack));
}
