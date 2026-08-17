/**
 * HTTP client for the PlayBound game-host agent on the public VPS.
 * Soft-fails when GAME_HOST_URL / GAME_HOST_SECRET are unset.
 */

const TIMEOUT_MS = 12_000;

export type GameHostRoom = {
  roomId: string;
  host: string;
  port: number;
  gameSlug: string;
  name?: string;
  roomCode?: string | null;
};

function hostConfig(): { base: string; secret: string; publicIp: string } | null {
  const base = process.env.GAME_HOST_URL?.replace(/\/$/, "");
  const secret = process.env.GAME_HOST_SECRET;
  if (!base || !secret) return null;
  return {
    base,
    secret,
    publicIp: process.env.GAME_HOST_PUBLIC_IP?.trim() || "",
  };
}

export function isGameHostConfigured(): boolean {
  return hostConfig() !== null;
}

async function hostFetch(
  path: string,
  init: RequestInit
): Promise<Response | null> {
  const cfg = hostConfig();
  if (!cfg) return null;
  return fetch(`${cfg.base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.secret}`,
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export async function createHostRoom(opts: {
  gameSlug: string;
  partyId: string;
  name?: string;
  maxPlayers?: number;
  editionSlug?: string | null;
}): Promise<GameHostRoom | { error: string }> {
  const cfg = hostConfig();
  if (!cfg) return { error: "Game host is not configured" };

  try {
    const res = await hostFetch("/rooms", {
      method: "POST",
      body: JSON.stringify({
        gameSlug: opts.gameSlug,
        partyId: opts.partyId,
        name: opts.name,
        maxPlayers: opts.maxPlayers,
        editionSlug: opts.editionSlug || null,
      }),
    });
    if (!res) return { error: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as GameHostRoom & {
      error?: string;
    };
    if (!res.ok) {
      return { error: data.error || `Game host returned ${res.status}` };
    }
    if (!data.roomId || !data.port) {
      return { error: "Game host returned an incomplete room" };
    }
    const host = data.host || cfg.publicIp;
    if (!host) return { error: "Game host did not return a public IP" };
    return {
      roomId: data.roomId,
      host,
      port: Number(data.port),
      gameSlug: data.gameSlug || opts.gameSlug,
      name: data.name,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Game host unreachable";
    console.warn("[gameHost] create room failed:", message);
    return { error: message };
  }
}

export async function deleteHostRoom(roomId: string): Promise<boolean> {
  if (!roomId) return false;
  try {
    const res = await hostFetch(`/rooms/${encodeURIComponent(roomId)}`, {
      method: "DELETE",
    });
    if (!res) return false;
    if (!res.ok && res.status !== 404) {
      console.warn("[gameHost] delete room failed:", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[gameHost] delete room error:", err);
    return false;
  }
}

export async function archiveArtifactOnHost(input: {
  url: string;
  relativePath: string;
  sizeBytes: number;
  sha256?: string | null;
}): Promise<{ success: boolean; queued?: boolean; message?: string }> {
  try {
    const res = await hostFetch("/mirror/archive", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!res) return { success: false, message: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
    return res.ok
      ? { success: true, queued: data.status === "uploading" }
      : { success: false, message: data.error || `Game host returned ${res.status}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Game host unreachable" };
  }
}

export async function archivedArtifactStatusOnHost(
  relativePath: string
): Promise<{ status: "missing" | "uploading" | "verified"; message?: string } | null> {
  try {
    const res = await hostFetch(`/mirror/archive/${encodeURIComponent(relativePath)}`, { method: "GET" });
    if (!res) return null;
    const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
    if (!res.ok || !["missing", "uploading", "verified"].includes(String(data.status))) {
      return { status: "missing", message: data.error || `Game host returned ${res.status}` };
    }
    return { status: data.status as "missing" | "uploading" | "verified", message: data.error };
  } catch (err) {
    return { status: "missing", message: err instanceof Error ? err.message : "Game host unreachable" };
  }
}

export async function deleteArchivedArtifactOnHost(relativePath: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await hostFetch(`/mirror/archive/${encodeURIComponent(relativePath)}`, {
      method: "DELETE",
    });
    if (!res) return { success: false, message: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok || res.status === 404
      ? { success: true }
      : { success: false, message: data.error || `Game host returned ${res.status}` };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : "Game host unreachable" };
  }
}
