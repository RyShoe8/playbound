"use strict";

/**
 * gameControls.js
 *
 * Resolves keyboard, mouse, and controller controls for games in the catalog.
 * Bundles 160+ curated game control schemes from PlayBound's catalog batches,
 * and provides clean standard PC and gamepad defaults for any other title.
 */

const path = require("path");
let BUNDLED_CONTROLS = {};
try {
  BUNDLED_CONTROLS = require("./gameControlsData.json");
} catch {
  BUNDLED_CONTROLS = {};
}

const QUIT_HINTS_BY_SLUG = {
  "tmnt-rescue-palooza":
    "Press Escape on the host keyboard to leave the game or quit OpenBOR.",
  "x-men-arcade-remake":
    "Press Escape on the host keyboard to leave the game or quit OpenBOR.",
  "streets-of-rage-remake":
    "Press Escape on the host keyboard to leave the game or quit (Alt+F4 also works).",
  "dune-legacy":
    "Press Escape to leave the game or open the game menu.",
  "old-school-runescape":
    "Use in-game Logout or the close button to leave the game.",
};

const STANDARD_CONTROLS_FALLBACK = {
  schemes: [
    {
      scheme: "keyboard",
      supported: true,
      bindings: [
        { action: "Move", input: "W, A, S, D / Arrow Keys", group: "Movement" },
        { action: "Primary Action / Attack", input: "Left Mouse / Space", group: "Combat" },
        { action: "Secondary Action / Aim", input: "Right Mouse", group: "Combat" },
        { action: "Interact / Use", input: "E / Enter", group: "Interaction" },
        { action: "In-Game Menu / Pause", input: "Escape", group: "Interface" },
        { action: "Leave the game / Exit", input: "Escape (or Alt+F4)", group: "Interface" },
      ],
      notes: "Default keyboard and mouse bindings. Keys can be customized in game settings.",
    },
    {
      scheme: "controller",
      supported: true,
      bindings: [
        { action: "Move", input: "Left Stick / D-Pad", group: "Movement" },
        { action: "Primary Action / Attack", input: "A / Cross (or X / Square)", group: "Combat" },
        { action: "Secondary Action / Aim", input: "Right Trigger / B / Circle", group: "Combat" },
        { action: "Interact / Confirm", input: "A / Cross", group: "Interaction" },
        { action: "Pause / Game Menu", input: "Start / Options", group: "Interface" },
      ],
      notes: "Default controller bindings using standard gamepad layout.",
    },
  ],
  notes: "Controls can be customized in the game's options menu. Press Escape to leave the game.",
};

function getGameControls(slug) {
  if (!slug) return null;
  const key = String(slug).trim().toLowerCase();
  return BUNDLED_CONTROLS[key] || null;
}

function resolveQuitHint(slug) {
  if (!slug) return "Press Escape to leave the game or exit to menu (Alt+F4 also works).";
  const key = String(slug).trim().toLowerCase();
  return (
    QUIT_HINTS_BY_SLUG[key] ||
    "Press Escape to leave the game or exit to menu (Alt+F4 also works)."
  );
}

function resolveControlsForGame(slug, catalogEntry = null) {
  // 1. Entry controls if available
  if (catalogEntry?.controls && Array.isArray(catalogEntry.controls.schemes) && catalogEntry.controls.schemes.length > 0) {
    return catalogEntry.controls;
  }

  // 2. Curated bundled controls
  const bundled = getGameControls(slug);
  if (bundled && Array.isArray(bundled.schemes) && bundled.schemes.length > 0) {
    return bundled;
  }

  // 3. Fallback standard controls
  const hasPad =
    catalogEntry?.hasControllerSupport ||
    catalogEntry?.features?.some?.((f) => /controller|gamepad/i.test(f));

  return {
    ...STANDARD_CONTROLS_FALLBACK,
    schemes: STANDARD_CONTROLS_FALLBACK.schemes.map((s) => ({
      ...s,
      supported: s.scheme === "controller" ? (hasPad !== false) : true,
    })),
  };
}

module.exports = {
  getGameControls,
  resolveQuitHint,
  resolveControlsForGame,
  STANDARD_CONTROLS_FALLBACK,
  QUIT_HINTS_BY_SLUG,
};
