/**
 * CloudSaves — deciding what to sync, and moving it.
 *
 * SaveData.js owns the dangerous local half (snapshot, restore, prune). This
 * module owns the question that comes before it: given what is on this machine
 * and what is on the server, which way should data move — if either?
 *
 * That decision is deliberately a pure function. Sync bugs are the ones that
 * lose people's progress, and "upload when we should have downloaded" is not
 * something to discover in production, so `decideSync` can be exercised
 * exhaustively without a network or a filesystem.
 *
 * The rule throughout: when the answer is not obvious, do nothing and ask.
 * A conflict left for the player to resolve costs them a click; a conflict
 * resolved wrongly costs them a save file.
 */

/**
 * @typedef {object} SyncState
 * @property {string | null} localUpdatedAt   ISO time the local saves last changed.
 * @property {string | null} remoteUpdatedAt  ISO time the newest remote snapshot was taken.
 * @property {string | null} lastSyncedAt     ISO time of the last successful sync, if any.
 * @property {string | null} lastSyncedDevice Device id that performed it.
 * @property {string} deviceId                This machine.
 */

/**
 * @typedef {object} SyncDecision
 * @property {"upload"|"download"|"conflict"|"noop"} action
 * @property {string} reason  Shown to the player when it matters; always logged.
 */

function ms(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** Clock skew between machines is normal; treat near-identical times as equal. */
const SKEW_TOLERANCE_MS = 5000;

/**
 * Which way should saves move?
 *
 * The interesting case is the third one. If both sides changed since the last
 * sync, whichever is newer is not necessarily the one worth keeping — the older
 * edit may be a long session on another machine. Newest-wins would silently
 * discard it, so this reports a conflict and lets the player choose.
 *
 * @param {SyncState} state
 * @returns {SyncDecision}
 */
function decideSync(state) {
  const local = ms(state.localUpdatedAt);
  const remote = ms(state.remoteUpdatedAt);
  const synced = ms(state.lastSyncedAt);

  if (local === null && remote === null) {
    return { action: "noop", reason: "No saves on this machine or in the cloud yet." };
  }
  if (local === null) {
    return { action: "download", reason: "No local saves — restoring from the cloud." };
  }
  if (remote === null) {
    return { action: "upload", reason: "No cloud copy yet — uploading this machine's saves." };
  }

  if (Math.abs(local - remote) <= SKEW_TOLERANCE_MS) {
    return { action: "noop", reason: "Cloud and local saves already match." };
  }

  // Never synced before, and both sides have data that did not come from each
  // other. Nothing here can tell us which is wanted.
  if (synced === null) {
    return {
      action: "conflict",
      reason: "Saves exist both here and in the cloud, and this machine has not synced before.",
    };
  }

  const localChanged = local > synced + SKEW_TOLERANCE_MS;
  const remoteChanged = remote > synced + SKEW_TOLERANCE_MS;

  if (localChanged && remoteChanged) {
    return {
      action: "conflict",
      reason: "Saves changed here and on another device since the last sync.",
    };
  }
  if (localChanged) {
    return { action: "upload", reason: "This machine has newer progress." };
  }
  if (remoteChanged) {
    return { action: "download", reason: "Another device has newer progress." };
  }

  /*
   * Neither side is newer than the last sync, yet their timestamps differ.
   * That should not happen, so rather than pick one, keep both: uploading is
   * additive — it adds a snapshot to history without overwriting anything the
   * player can still restore.
   */
  return {
    action: "upload",
    reason: "Timestamps disagree but neither is newer than the last sync; preserving both.",
  };
}

/**
 * Newest modification time anywhere under a directory, as an ISO string.
 *
 * Directory mtimes are unreliable across platforms — a change to a file deep in
 * the tree does not always bubble up — so this walks the files themselves.
 */
async function newestMtime(fsp, path, dir, { skip } = {}) {
  let newest = null;
  async function walk(current) {
    let entries;
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (skip && skip.has(entry.name.toLowerCase())) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        try {
          const st = await fsp.stat(full);
          if (newest === null || st.mtimeMs > newest) newest = st.mtimeMs;
        } catch {
          /* unreadable file: ignore rather than fail the whole scan */
        }
      }
    }
  }
  await walk(dir);
  return newest === null ? null : new Date(newest).toISOString();
}

/**
 * Build the sync client.
 *
 * Network access is injected so the transport can be swapped or stubbed; the
 * launcher passes its authenticated fetch wrapper.
 */
function createCloudSaves({ apiBase, authedFetch, saveData, log = () => {} }) {
  async function listRemote(gameSlug, editionSlug) {
    const url =
      `${apiBase()}/api/launcher/saves/${encodeURIComponent(gameSlug)}` +
      `/${encodeURIComponent(editionSlug || "official")}`;
    const res = await authedFetch(url, { method: "GET" });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Save list failed (${res.status})`);
    const data = await res.json();
    return Array.isArray(data?.snapshots) ? data.snapshots : [];
  }

  /**
   * Push the newest local snapshot.
   *
   * Snapshots first so there is always a local copy of exactly what was sent —
   * if the upload half-completes, the player has lost nothing.
   */
  async function upload(gameSlug, editionSlug, saveDir) {
    const snap = await saveData.snapshot(gameSlug, editionSlug, saveDir, { reason: "cloud-upload" });
    if (snap.status !== "captured") return { status: snap.status };

    const url =
      `${apiBase()}/api/launcher/saves/${encodeURIComponent(gameSlug)}` +
      `/${encodeURIComponent(editionSlug || "official")}`;
    const res = await authedFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ snapshotId: snap.id, files: snap.files, bytes: snap.bytes }),
    });
    if (!res.ok) throw new Error(`Save upload failed (${res.status})`);
    log(`uploaded ${gameSlug} save snapshot ${snap.id}`);
    return { status: "uploaded", snapshotId: snap.id, files: snap.files };
  }

  return { listRemote, upload, decideSync, newestMtime };
}

module.exports = { createCloudSaves, decideSync, newestMtime, SKEW_TOLERANCE_MS };
