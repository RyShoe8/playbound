/**
 * What a player actually has installed, per game.
 *
 * One library row exists per {user, game, platform}, so the row has to carry
 * *every* installed edition rather than one. Before `installedEditions` it
 * carried one, and the launcher — which sends a separate entry per edition —
 * had each write overwrite the last. The surviving edition was whichever
 * happened to be sorted last, and party config-sync then told people they were
 * missing an edition sitting on their disk.
 *
 * Pure on purpose: the grouping and the reading are the parts that were wrong,
 * and they are worth testing without standing up Mongo.
 */

import { BASE_EDITION_KEY, isBaseEditionSlug } from "@/lib/playTogether/editionMatch";

export interface InstallItem {
  slug: string;
  version?: string;
  editionSlug?: string | null;
}

export interface GroupedInstall {
  slug: string;
  /** Version of the primary edition, when one was reported. */
  version?: string;
  /** Default edition to launch. Null when only unlabelled installs arrived. */
  editionSlug: string | null;
  /** Every edition present on the device, deduped and stable-sorted. */
  installedEditions: string[];
}

/**
 * Collapse the launcher's per-edition entries into one write per game.
 *
 * The launcher reports `[{holocure, playbound}, {holocure, official}]`; this
 * turns that into a single row carrying both. Doing it here rather than with
 * repeated `$addToSet` writes also keeps the batch authoritative — the array is
 * replaced wholesale, so an edition the player uninstalled does not linger.
 */
export function groupInstallsBySlug(installs: InstallItem[]): GroupedInstall[] {
  const bySlug = new Map<string, GroupedInstall>();

  for (const item of installs) {
    const slug = String(item.slug || "");
    if (!slug) continue;

    const existing = bySlug.get(slug) ?? {
      slug,
      version: undefined,
      editionSlug: null,
      installedEditions: [],
    };

    const edition = item.editionSlug ? String(item.editionSlug) : null;
    if (edition && !existing.installedEditions.includes(edition)) {
      existing.installedEditions.push(edition);
    }

    /*
     * First labelled edition wins the primary slot. The launcher emits its
     * primary first, so this preserves the player's default rather than
     * letting iteration order decide which build Play opens.
     */
    if (!existing.editionSlug && edition) existing.editionSlug = edition;
    if (!existing.version && item.version) existing.version = item.version;

    bySlug.set(slug, existing);
  }

  return [...bySlug.values()];
}

/** A stored row, as far as edition reading is concerned. */
export interface LibraryEditionRow {
  installed?: boolean;
  editionSlug?: string | null;
  installedEditions?: string[] | null;
}

/**
 * Every edition slug this row proves the player has.
 *
 * `BASE_EDITION_KEY` is always included for an installed row: having any build
 * of a game means having the game, which is what a party that only picked the
 * title needs to know.
 *
 * Falls back to `editionSlug` so rows written before `installedEditions`
 * existed keep resolving — an empty array on a legacy row means "not recorded",
 * never "nothing installed".
 */
export function editionsFromRow(row: LibraryEditionRow): Set<string> {
  const out = new Set<string>();
  if (!row.installed) return out;

  for (const slug of row.installedEditions ?? []) {
    if (slug) out.add(String(slug));
  }
  if (row.editionSlug) out.add(String(row.editionSlug));
  out.add(BASE_EDITION_KEY);
  return out;
}

/**
 * The edition a party should treat as the reference.
 *
 * Prefers the row's declared primary, because that is the build the player
 * actually launches. Falls back to any real edition present, and finally to the
 * base key when everything installed is an unlabelled/official build — at which
 * point the party requires no particular edition.
 */
export function primaryEditionFromRow(row: LibraryEditionRow): string {
  if (row.editionSlug && !isBaseEditionSlug(row.editionSlug)) return String(row.editionSlug);
  for (const slug of row.installedEditions ?? []) {
    if (slug && !isBaseEditionSlug(slug)) return String(slug);
  }
  return BASE_EDITION_KEY;
}
