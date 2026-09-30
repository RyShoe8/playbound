/**
 * Whether a catalog item gets the "Controller" tag on its card — native pad
 * support and PlayBound Controls both count. Mirrors the website's
 * `supportsController` (platform/src/lib/controller/support.ts) so a game
 * carries the same tag on the web and in the launcher. Keep the two in step.
 */
const CONTROLLER_PATTERNS = [/\bcontroller\b/i, /\bgamepad\b/i, /\bflightstick\b/i, /\bhotas\b/i, /\bjoystick\b/i, /\bwheel\b/i];

export function itemSupportsController(item) {
  if (!item) return false;
  if (typeof item.hasControllerSupport === "boolean") return item.hasControllerSupport;
  const haystack = [...(item.features || []), ...(item.tags || [])].join(" | ");
  return CONTROLLER_PATTERNS.some((pattern) => pattern.test(haystack));
}
