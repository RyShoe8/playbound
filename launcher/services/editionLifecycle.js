"use strict";

const fs = require("fs");

function isInstallerBackedEntry(entry) {
  return entry?.kind === "direct-installer" || entry?.kind === "github-installer";
}

/**
 * Community/add-on editions are removed by deleting only their managed
 * folder; invoking a registry uninstaller for one can remove its separately
 * owned base game. The official edition is the product itself, though, and an
 * installer-backed official edition (Freeciv, for example) must be allowed to
 * run its own uninstaller.
 *
 * When several catalog editions share one vendor install path (UQM PlayBound +
 * Classic both land in Program Files), the last edition that still owns that
 * path may also run the product uninstaller.
 */
function mayRunNativeUninstaller(editionSlug, entry = null, opts = {}) {
  if (!editionSlug) return true;
  if (opts.lastOwnerOfInstallPath && isInstallerBackedEntry(entry)) return true;
  if (editionSlug !== "official") return false;
  return isInstallerBackedEntry(entry);
}

/**
 * Edition-specific executable selection. TES3MP hosting is orchestrated by
 * the local server manager; both local play and remote joins use its client.
 */
function editionLaunchExecutable(info) {
  return info?.exe || "";
}

module.exports = { mayRunNativeUninstaller, editionLaunchExecutable };
