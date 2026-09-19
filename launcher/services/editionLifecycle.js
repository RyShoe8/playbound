"use strict";

const fs = require("fs");

function isInstallerBackedEntry(entry) {
  return (
    entry?.kind === "direct-installer" ||
    entry?.kind === "github-installer" ||
    entry?.kind === "external" ||
    entry?.installMethod === "external_installer" ||
    entry?.installMethod === "playbound_installer" ||
    Boolean(entry?.hasUninstaller)
  );
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
  // If an uninstaller executable was explicitly found on disk in this directory,
  // and no other edition shares the path, running the native uninstaller is safe and intended.
  if (opts.hasUninstaller) {
    if (!editionSlug) return true;
    if (opts.lastOwnerOfInstallPath || editionSlug === "official" || opts.isStandalone) {
      return true;
    }
  }

  /*
   * Full-game uninstall (no editionSlug): only installer-backed recipes should
   * invoke a vendor/registry uninstaller. Zip and portable exe games are just
   * folders under the PlayBound games directory — launching Apps & features for
   * those (title match on "Xonotic", "Warzone 2100", …) opens a unrelated
   * Windows uninstall UI while leaving the managed folder behind.
   */
  if (!editionSlug) {
    if (!entry) return true;
    return isInstallerBackedEntry(entry);
  }
  if (opts.lastOwnerOfInstallPath && isInstallerBackedEntry(entry)) return true;
  if (opts.isStandalone && isInstallerBackedEntry(entry)) return true;
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
