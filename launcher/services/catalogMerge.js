/**
 * Reconciling the three catalog sources the launcher has.
 *
 *   remote   the live feed — the only thing that knows what exists today
 *   cached   the last good remote list, on disk, for offline starts
 *   bundled  the list shipped inside the build
 *
 * These used to be unioned into one map, which meant a slug only had to appear
 * in any of them once to survive forever. Worse, the union was written back to
 * the cache, so it re-seeded itself on the next refresh: unpublishing a game or
 * renaming its slug left the old entry on the games page permanently, and
 * shipping a corrected catalog.js could not clear it.
 *
 * So membership comes from one source, and the others only fill in fields.
 */

/** Field-level merge for one slug: bundled < cached < authoritative. */
function enrich(entry, bundledBySlug, cachedBySlug) {
  return {
    ...(bundledBySlug.get(entry.slug) || {}),
    ...(cachedBySlug.get(entry.slug) || {}),
    ...entry,
  };
}

function indexBySlug(list) {
  return new Map((Array.isArray(list) ? list : []).filter((e) => e?.slug).map((e) => [e.slug, e]));
}

/**
 * The catalog after a successful refresh.
 *
 * `remote` decides membership outright — a game missing from it has been
 * unpublished, renamed or removed, and must disappear here too. An empty
 * remote list is treated as "no answer" rather than "no games", so a bad
 * response cannot wipe the catalog.
 */
function reconcileCatalog({ remote, cached, bundled }) {
  const remoteList = (Array.isArray(remote) ? remote : []).filter((e) => e?.slug);
  if (remoteList.length === 0) {
    return { games: null, removed: [] };
  }

  const bundledBySlug = indexBySlug(bundled);
  const cachedBySlug = indexBySlug(cached);
  const remoteSlugs = new Set(remoteList.map((e) => e.slug));

  const previous = [...indexBySlug(cached).keys(), ...indexBySlug(bundled).keys()];
  const removed = [...new Set(previous)].filter((slug) => !remoteSlugs.has(slug));

  return {
    games: remoteList.map((entry) => enrich(entry, bundledBySlug, cachedBySlug)),
    removed,
  };
}

/**
 * The catalog at startup, before any network call.
 *
 * The cache is the last list the live feed gave us, so it is closer to the
 * truth than the build's own copy and decides membership when present. Only a
 * launcher that has never successfully refreshed falls back to bundled.
 */
function startupCatalog({ cached, bundled }) {
  const cachedList = (Array.isArray(cached) ? cached : []).filter((e) => e?.slug);
  if (cachedList.length === 0) {
    return (Array.isArray(bundled) ? bundled : []).filter((e) => e?.slug).map((e) => ({ ...e }));
  }
  const bundledBySlug = indexBySlug(bundled);
  return cachedList.map((entry) => ({ ...(bundledBySlug.get(entry.slug) || {}), ...entry }));
}

module.exports = { reconcileCatalog, startupCatalog };
