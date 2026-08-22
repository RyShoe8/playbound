/**
 * Shared rules for persisting probe/heal patches onto game & mod recipes.
 */

import type { ProbeResult } from "@/lib/catalogVersionProbe";

/** Flat launcherInstall.* fields to $set for a game document. */
export function gameProbePatchFields(
  install: {
    kind?: string | null;
    autoUpdatePinned?: boolean | null;
  },
  result: ProbeResult
): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  if (result.status !== "updated" || install.autoUpdatePinned === false || !result.patch) {
    return set;
  }

  const kind = String(install.kind || "");
  const isDirect = kind.startsWith("direct");
  const isHeal = Boolean(result.note?.startsWith("auto-healed:"));

  // Direct recipes: pin URL to latest. Auto-heal: also repair github assetPattern / URL.
  if (!isDirect && !isHeal) return set;

  if (result.patch.url) set["launcherInstall.url"] = result.patch.url;
  if (result.patch.fileName) set["launcherInstall.fileName"] = result.patch.fileName;
  if (result.patch.versionLabel) set["launcherInstall.versionLabel"] = result.patch.versionLabel;
  if (result.patch.kind && isHeal) set["launcherInstall.kind"] = result.patch.kind;
  if (result.patch.assetPattern && (isHeal || isDirect)) {
    set["launcherInstall.assetPattern"] = result.patch.assetPattern;
  }

  return set;
}

/** Top-level mod fields to apply (and return as `applied` for API responses). */
export function modProbePatchFields(
  mod: {
    downloadKind?: string | null;
    autoUpdatePinned?: boolean | null;
  },
  result: ProbeResult
): Record<string, string> {
  const applied: Record<string, string> = {};
  if (result.status !== "updated" || mod.autoUpdatePinned === false || !result.patch) {
    return applied;
  }

  const kind = mod.downloadKind || "";
  const isHeal = Boolean(result.note?.startsWith("auto-healed:"));

  if (result.patch.directUrl && (kind === "direct-zip" || isHeal)) {
    applied.directUrl = result.patch.directUrl;
  }
  if (result.patch.assetPattern && (kind === "github-zip" || isHeal)) {
    applied.assetPattern = result.patch.assetPattern;
  }

  return applied;
}
