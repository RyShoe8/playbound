/**
 * HTTP client for the PlayBound game-host agent on the public VPS.
 * Soft-fails when GAME_HOST_URL / GAME_HOST_SECRET are unset.
 */

const TIMEOUT_MS = 12_000;
/** Room create may auto-download a dedicated binary (e.g. etlded) on first use. */
const CREATE_ROOM_TIMEOUT_MS = 5 * 60 * 1000;
const ENSURE_TIMEOUT_MS = 10 * 60 * 1000;
const TEST_SPAWN_TIMEOUT_MS = 15 * 60 * 1000;

export type GameHostRoom = {
  roomId: string;
  partyId: string;
  host: string;
  port: number;
  gameSlug: string;
  name?: string;
  roomCode?: string | null;
  createdAt?: number;
  /**
   * What the agent actually started this room with — the recipe's defaults
   * plus whatever host-chosen settings it accepted. Read it rather than
   * trusting our own record: a room can outlive the deploy that made it.
   */
  settings?: Record<string, string | number | boolean>;
};

export type GameHostHealth = {
  ok?: boolean;
  publicIp?: string | null;
  rooms?: number;
  maxRooms?: number;
  games?: Record<string, boolean>;
  gameStatus?: Record<string, { installed: boolean; ready: boolean }>;
  gameVersions?: Record<string, string | null>;
  gameVersionsCachedAt?: number | null;
  lastSpawnTest?: Record<string, LastSpawnTestEntry>;
};

export type LastSpawnTestEntry = {
  ok: boolean;
  error?: string | null;
  at: string;
  durationMs?: number | null;
  port?: number | null;
};

export type SpawnTestResult = {
  ok: boolean;
  error?: string;
  durationMs?: number;
  port?: number | null;
  skipped?: boolean;
  gameSlug?: string;
  results?: Record<string, SpawnTestResult>;
  lastSpawnTest?: Record<string, LastSpawnTestEntry>;
};

export type GameHostMetrics = {
  collectedAt?: string;
  uptimeSec?: number;
  publicIp?: string | null;
  agentVersion?: string;
  cpu?: {
    cores?: number;
    load1?: number;
    load5?: number;
    load15?: number;
    usagePercent?: number | null;
  };
  memory?: {
    totalBytes?: number;
    usedBytes?: number;
    freeBytes?: number;
    usedPercent?: number;
  };
  storage?: Array<{
    path: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
    error?: string;
  }>;
  bandwidth?: {
    iface?: string | null;
    rxMbps?: number;
    txMbps?: number;
    rxBytesTotal?: number;
    txBytesTotal?: number;
  };
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

export function getGameHostPublicIp(): string | null {
  return hostConfig()?.publicIp || null;
}

export async function fetchGameHostHealth(): Promise<
  { configured: true; health: GameHostHealth } | { configured: false; error: string }
> {
  const cfg = hostConfig();
  if (!cfg) return { configured: false, error: "Game host is not configured" };
  try {
    const res = await fetch(`${cfg.base}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const health = (await res.json().catch(() => ({}))) as GameHostHealth;
    if (!res.ok) {
      return { configured: false, error: `Game host health returned ${res.status}` };
    }
    return { configured: true, health };
  } catch (err) {
    return {
      configured: false,
      error: err instanceof Error ? err.message : "Game host unreachable",
    };
  }
}

export async function fetchGameHostMetrics(): Promise<
  | { ok: true; metrics: GameHostMetrics }
  | { ok: false; error: string; outdatedAgent?: boolean }
> {
  try {
    const res = await hostFetch("/metrics", { method: "GET" });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const metrics = (await res.json().catch(() => ({}))) as GameHostMetrics;
    if (!res.ok) {
      if (res.status === 404) {
        return {
          ok: false,
          outdatedAgent: true,
          error:
            "VPS agent is outdated — SSH in and run `sudo bash install.sh` in platform/game-host after git pull",
        };
      }
      return { ok: false, error: `Game host metrics returned ${res.status}` };
    }
    return { ok: true, metrics };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Game host unreachable",
    };
  }
}

export async function listHostRooms(): Promise<
  { ok: true; rooms: GameHostRoom[] } | { ok: false; error: string }
> {
  try {
    const res = await hostFetch("/rooms", { method: "GET" });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as { rooms?: GameHostRoom[]; error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error || `Game host returned ${res.status}` };
    }
    return { ok: true, rooms: data.rooms || [] };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Game host unreachable",
    };
  }
}

async function hostFetch(
  path: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS
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
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function createHostRoom(opts: {
  gameSlug: string;
  partyId: string;
  name?: string;
  /*
   * There is deliberately no maxPlayers here. One was sent for a long time and
   * the agent never read it — startRoom does not destructure it — so it did
   * nothing. Server slots are now a declared setting (see serverControl), and
   * that is the only channel: party size is who is in the party, which is not
   * the same question as how many slots the room has. A three-person party
   * does not want a three-slot server nobody else can join.
   */
  editionSlug?: string | null;
  /** Explicit override for games edition alone can't disambiguate — see Party.openRaMod. */
  mod?: string | null;
  /** Host-chosen server settings, already coerced against the game's schema. */
  settings?: Record<string, string | number | boolean>;
}): Promise<GameHostRoom | { error: string }> {
  const cfg = hostConfig();
  if (!cfg) return { error: "Game host is not configured" };

  try {
    const res = await hostFetch(
      "/rooms",
      {
        method: "POST",
        body: JSON.stringify({
          gameSlug: opts.gameSlug,
          partyId: opts.partyId,
          name: opts.name,
          editionSlug: opts.editionSlug || null,
          mod: opts.mod || null,
          settings: opts.settings || undefined,
        }),
      },
      CREATE_ROOM_TIMEOUT_MS
    );
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
      partyId: data.partyId || opts.partyId,
      host,
      port: Number(data.port),
      gameSlug: data.gameSlug || opts.gameSlug,
      name: data.name,
      // What the agent accepted, which is not always what was asked for.
      settings: data.settings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Game host unreachable";
    console.warn("[gameHost] create room failed:", message);
    return { error: message };
  }
}

export async function triggerTestSpawn(opts: {
  gameSlug?: string;
  all?: boolean;
}): Promise<
  | { ok: true; result: SpawnTestResult; lastSpawnTest?: Record<string, LastSpawnTestEntry> }
  | { ok: false; message: string; result?: SpawnTestResult; lastSpawnTest?: Record<string, LastSpawnTestEntry> }
> {
  try {
    const body = opts.all ? { all: true } : { gameSlug: opts.gameSlug };
    if (!opts.all && !opts.gameSlug) {
      return { ok: false, message: "gameSlug or all is required" };
    }
    const res = await hostFetch(
      "/test-spawn",
      { method: "POST", body: JSON.stringify(body) },
      TEST_SPAWN_TIMEOUT_MS
    );
    if (!res) {
      return { ok: false, message: "Game host is not configured" };
    }
    if (res.status === 404) {
      return {
        ok: false,
        message:
          "Agent missing /test-spawn — run updated install.sh on the VPS after git pull",
      };
    }
    const data = (await res.json().catch(() => ({}))) as SpawnTestResult & {
      error?: string;
      lastSpawnTest?: Record<string, LastSpawnTestEntry>;
    };
    if (!res.ok) {
      return {
        ok: false,
        message: data.error || `Game host returned ${res.status}`,
        result: data,
        lastSpawnTest: data.lastSpawnTest,
      };
    }
    return {
      ok: true,
      result: data,
      lastSpawnTest: data.lastSpawnTest,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Game host unreachable",
    };
  }
}

export async function ensureMissingHostGames(): Promise<{
  ok: boolean;
  skipped?: boolean;
  games?: Record<string, boolean>;
  results?: Record<string, { ok?: boolean; skipped?: boolean; error?: string }>;
  message?: string;
}> {
  try {
    const res = await hostFetch(
      "/ensure-missing",
      { method: "POST", body: "{}" },
      ENSURE_TIMEOUT_MS
    );
    if (!res) {
      return { ok: true, skipped: true, message: "Game host is not configured" };
    }
    if (res.status === 404) {
      return {
        ok: false,
        message:
          "Agent missing /ensure-missing — run updated install.sh on the VPS once",
      };
    }
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      games?: Record<string, boolean>;
      results?: Record<string, { ok?: boolean; skipped?: boolean; error?: string }>;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, message: data.error || `Game host returned ${res.status}` };
    }
    return {
      ok: Boolean(data.ok),
      games: data.games,
      results: data.results,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Game host unreachable",
    };
  }
}

/**
 * Run one command on a room's game server, through the agent.
 *
 * The control password lives on the VPS and is never sent here, so this is the
 * only way the platform can reach a running server — which is the point. The
 * command itself must be composed from declared settings by
 * src/lib/serverControl/rcon.ts, never assembled from anything a host typed.
 */
export async function sendRoomCommand(
  roomId: string,
  command: string
): Promise<{ ok: true; response: string } | { ok: false; error: string }> {
  if (!roomId) return { ok: false, error: "No room to command" };
  try {
    const res = await hostFetch(`/rooms/${encodeURIComponent(roomId)}/rcon`, {
      method: "POST",
      body: JSON.stringify({ command }),
    });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as { response?: string; error?: string };
    if (!res.ok) return { ok: false, error: data.error || `Game host returned ${res.status}` };
    return { ok: true, response: String(data.response ?? "") };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Game host unreachable" };
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
