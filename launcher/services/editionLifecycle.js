"use strict";

const fs = require("fs");

/**
 * Community/add-on editions are removed by deleting only their managed
 * folder; invoking a registry uninstaller for one can remove its separately
 * owned base game. The official edition is the product itself, though, and an
 * installer-backed official edition (Freeciv, for example) must be allowed to
 * run its own uninstaller.
 */
function mayRunNativeUninstaller(editionSlug, entry = null) {
  if (!editionSlug) return true;
  if (editionSlug !== "official") return false;
  return entry?.kind === "direct-installer" || entry?.kind === "github-installer";
}

/**
 * Edition-specific executable selection. TES3MP hosting is orchestrated by
 * the local server manager; both local play and remote joins use its client.
 */
function editionLaunchExecutable(info) {
  return info?.exe || "";
}

module.exports = { mayRunNativeUninstaller, editionLaunchExecutable };
