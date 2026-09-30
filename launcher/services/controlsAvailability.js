"use strict";

/**
 * Decides whether PlayBound Controls is offered for a game, and — the point of
 * this module — says WHY when it is not. Every "no" used to be silent: the
 * launch popup just never appeared and the game started in keyboard mode.
 *
 * Pure: every environment fact is injected so tests can cover each branch.
 */

/**
 * Games that must show a controls popup in every build. A missing profile for
 * one of these is a regression, not an ordinary "game has no profile".
 * OutRun has no native pad support at all, so its live catalog profile is the
 * only reason it gets a popup.
 */
const EXPECTED_CONTROLS_GAMES = Object.freeze(["outrun", "holocure", "wolfenstein-enemy-territory"]);

const REASONS = Object.freeze({
  NOT_WINDOWS: "not_windows",
  COUCH_PARTY: "couch_party_active",
  NO_HOST: "controls_host_missing",
  NO_PROFILE: "no_profile_found_or_lookup_failed",
  NOT_VERIFIED: "profile_not_verified",
  NEEDS_PREVIEW: "testing_profile_needs_preview",
  BAD_STRATEGY: "profile_not_keyboard_mouse",
});

async function resolveControlsAvailability({
  platform,
  couchDisqualifies,
  hasControlsHost,
  fetchProfile,
  bundledProfile,
  slug,
  editionSlug = null,
  allowPreview = false,
}) {
  if (platform !== "win32") return { profile: null, reason: REASONS.NOT_WINDOWS };
  if (couchDisqualifies) return { profile: null, reason: REASONS.COUCH_PARTY };
  if (!hasControlsHost) return { profile: null, reason: REASONS.NO_HOST };

  const profile = (await fetchProfile(slug, editionSlug, allowPreview)) || bundledProfile(slug);
  if (!profile) return { profile: null, reason: REASONS.NO_PROFILE };

  const approved = profile.status === "verified" && profile.antiCheatCompatibility === "verified";
  const testing = allowPreview && profile.status === "testing";
  if (!approved && !testing) {
    return { profile: null, reason: profile.status === "testing" ? REASONS.NEEDS_PREVIEW : REASONS.NOT_VERIFIED };
  }
  if (profile.inputStrategy !== "keyboard_mouse") return { profile: null, reason: REASONS.BAD_STRATEGY };
  return { profile, reason: null };
}

/** One console line per skipped popup; loud for games that must have one. */
function logControlsSkip(slug, reason, log = console) {
  if (!reason) return;
  const expected = EXPECTED_CONTROLS_GAMES.includes(slug);
  // Most games legitimately have no profile — only surface that for the
  // games that are supposed to have one.
  if (reason === REASONS.NO_PROFILE && !expected) return;
  (expected ? log.warn : log.log)(`[playbound-controls] popup skipped for "${slug}": ${reason}${expected ? " (EXPECTED to be available)" : ""}`);
}

module.exports = { EXPECTED_CONTROLS_GAMES, REASONS, resolveControlsAvailability, logControlsSkip };
