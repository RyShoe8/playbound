"use strict";

/** Shared "apply defaults once per game" marker, stored in launcher settings. */
function isFirstRun(ctx) {
  return !ctx.loadSettings().openborFullscreenApplied?.[ctx.slug];
}

function markFirstRunDone(ctx) {
  const settings = ctx.loadSettings();
  ctx.saveSettings({
    ...settings,
    openborFullscreenApplied: { ...(settings.openborFullscreenApplied || {}), [ctx.slug]: true },
  });
}

module.exports = { isFirstRun, markFirstRunDone };
