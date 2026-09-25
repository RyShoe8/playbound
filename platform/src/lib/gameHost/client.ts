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
  communityServerId?: string | null;
  pid?: number | null;
  resources?: { available: boolean; rssBytes?: number; cpuCores?: number | null };
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

export type ManagedHostStatus = {
  status: "pending" | "running" | "failed" | "stopped";
  error?: string;
  room?: GameHostRoom;
  at?: number;
};

export async function listManagedHostRooms(): Promise<
  | { ok: true; rooms: GameHostRoom[]; jobs: Record<string, ManagedHostStatus> }
  | { ok: false; error: string }
> {
  try {
    const res = await hostFetch("/managed", { method: "GET" });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const data = (await res.json()) as { rooms?: GameHostRoom[]; jobs?: Record<string, ManagedHostStatus>; error?: string };
    if (!res.ok) return { ok: false, error: data.error || `Game host returned ${res.status}` };
    return { ok: true, rooms: data.rooms || [], jobs: data.jobs || {} };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Game host unreachable" };
  }
}

export async function requestManagedHostRoom(opts: {
  communityServerId: string;
  gameSlug: string;
  editionSlug?: string | null;
  mod?: string | null;
  name: string;
  settings?: Record<string, string | number | boolean>;
}): Promise<ManagedHostStatus | { status: "failed"; error: string }> {
  try {
    const res = await hostFetch("/managed", { method: "POST", body: JSON.stringify(opts) });
    if (!res) return { status: "failed", error: "Game host is not configured" };
    const data = (await res.json()) as ManagedHostStatus;
    return res.ok ? data : { status: "failed", error: data.error || `Game host returned ${res.status}` };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "Game host unreachable" };
  }
}

export async function stopManagedHostRoom(communityServerId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await hostFetch(`/managed/${encodeURIComponent(communityServerId)}`, { method: "DELETE" });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const data = (await res.json()) as { ok?: boolean; error?: string };
    return res.ok ? { ok: true } : { ok: false, error: data.error || `Game host returned ${res.status}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Game host unreachable" };
  }
}

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
  const rawBase = process.env.GAME_HOST_URL?.trim();
  const secret = process.env.GAME_HOST_SECRET;
  if (!rawBase || !secret) return null;
  let base = rawBase.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    base = `http://${base}`;
  }
  try {
    const parsed = new URL(base);
    if (!parsed.port && parsed.protocol === "http:") {
      parsed.port = "8741";
    }
    base = parsed.origin;
  } catch {
    // preserve base if URL parsing fails
  }
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
  /**
   * Party leader's PlayBound username. TES3MP sets the client login to this
   * name; the agent promotes it to staffRank 2 after authenticate.
   */
  leaderUsername?: string | null;
  /**
   * Stable identity for a game's persistent world across sessions — the
   * party leader's user id. Parties end every session, so partyId cannot key
   * a save a group reloads week after week. Recipes without saves ignore it.
   */
  saveKey?: string | null;
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
          leaderUsername: opts.leaderUsername || null,
          saveKey: opts.saveKey || null,
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

/**
 * Merge login names into a TES3MP room's admin allowlist (staffRank promote hook).
 * Used when the party leader's in-game name is not their PlayBound username.
 */
export async function updateRoomAdmins(
  roomId: string,
  names: string[]
): Promise<{ ok: true; admins: string[] } | { ok: false; error: string }> {
  if (!roomId) return { ok: false, error: "No room" };
  try {
    const res = await hostFetch(`/rooms/${encodeURIComponent(roomId)}/admins`, {
      method: "POST",
      body: JSON.stringify({ names }),
    });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as { admins?: string[]; error?: string };
    if (!res.ok) return { ok: false, error: data.error || `Game host returned ${res.status}` };
    return { ok: true, admins: Array.isArray(data.admins) ? data.admins : [] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Game host unreachable" };
  }
}

export type Tes3mpAccountRow = {
  accountName: string;
  online: boolean;
  staffRank: number;
  /** TES3MP player id while online; what /invite takes. */
  pid?: number | null;
  /** The account overlay commands run as. */
  isAdmin?: boolean;
  /** Allied with the admin account. */
  ally?: boolean;
  /** Admin has invited them; they have not /join-ed yet. */
  invitePending?: boolean;
};

export async function listRoomTes3mpAccounts(
  roomId: string
): Promise<
  | { ok: true; accounts: Tes3mpAccountRow[]; adminAccount: string | null; startupRun: boolean }
  | { ok: false; error: string }
> {
  if (!roomId) return { ok: false, error: "No room" };
  try {
    const res = await hostFetch(`/rooms/${encodeURIComponent(roomId)}/tes3mp/accounts`, {
      method: "GET",
    });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as {
      accounts?: Tes3mpAccountRow[];
      adminAccount?: string | null;
      startupRun?: boolean;
      error?: string;
    };
    if (!res.ok) return { ok: false, error: data.error || `Game host returned ${res.status}` };
    return {
      ok: true,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      adminAccount: data.adminAccount || null,
      startupRun: Boolean(data.startupRun),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Game host unreachable" };
  }
}

export async function claimRoomTes3mpAdmin(
  roomId: string,
  accountName?: string | null
): Promise<
  | {
      ok: true;
      accountName: string;
      accounts: Tes3mpAccountRow[];
      adminAccount: string | null;
    }
  | { ok: false; error: string; accounts?: Tes3mpAccountRow[]; adminAccount?: string | null }
> {
  if (!roomId) return { ok: false, error: "No room" };
  try {
    const res = await hostFetch(`/rooms/${encodeURIComponent(roomId)}/tes3mp/claim-admin`, {
      method: "POST",
      body: JSON.stringify({ accountName: accountName || null }),
    });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as {
      accountName?: string;
      accounts?: Tes3mpAccountRow[];
      adminAccount?: string | null;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error || `Game host returned ${res.status}`,
        accounts: Array.isArray(data.accounts) ? data.accounts : undefined,
        adminAccount: data.adminAccount ?? null,
      };
    }
    return {
      ok: true,
      accountName: String(data.accountName || accountName || ""),
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      adminAccount: data.adminAccount || null,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Game host unreachable" };
  }
}

/**
 * Overlay command buttons: /invite <pid> ("Make Ally") and /runstartup, run
 * by the room's online TES3MP admin account.
 */
export async function runRoomTes3mpCommand(
  roomId: string,
  command: "invite" | "runstartup",
  targetPid?: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!roomId) return { ok: false, error: "No room" };
  try {
    const res = await hostFetch(`/rooms/${encodeURIComponent(roomId)}/tes3mp/command`, {
      method: "POST",
      body: JSON.stringify({ command, targetPid: targetPid ?? null }),
    });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error || `Game host returned ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Game host unreachable" };
  }
}

export async function setRoomTes3mpHour(
  roomId: string,
  hour: number
): Promise<{ ok: true; hour: number } | { ok: false; error: string }> {
  if (!roomId) return { ok: false, error: "No room" };
  try {
    const res = await hostFetch(`/rooms/${encodeURIComponent(roomId)}/tes3mp/set-hour`, {
      method: "POST",
      body: JSON.stringify({ hour }),
    });
    if (!res) return { ok: false, error: "Game host is not configured" };
    const data = (await res.json().catch(() => ({}))) as { hour?: number; error?: string };
    if (!res.ok) return { ok: false, error: data.error || `Game host returned ${res.status}` };
    return { ok: true, hour: Number(data.hour) };
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
): Promise<{
  status: "missing" | "uploading" | "verified";
  message?: string;
  bytesReceived?: number;
  sizeBytes?: number;
} | null> {
  try {
    const res = await hostFetch(`/mirror/archive/${encodeURIComponent(relativePath)}`, { method: "GET" });
    if (!res) return null;
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      error?: string;
      bytesReceived?: number;
      sizeBytes?: number;
    };
    if (!res.ok || !["missing", "uploading", "verified"].includes(String(data.status))) {
      return { status: "missing", message: data.error || `Game host returned ${res.status}` };
    }
    const out: {
      status: "missing" | "uploading" | "verified";
      message?: string;
      bytesReceived?: number;
      sizeBytes?: number;
    } = {
      status: data.status as "missing" | "uploading" | "verified",
      message: data.error,
    };
    if (Number.isFinite(Number(data.bytesReceived))) out.bytesReceived = Number(data.bytesReceived);
    if (Number.isFinite(Number(data.sizeBytes)) && Number(data.sizeBytes) > 0) {
      out.sizeBytes = Number(data.sizeBytes);
    }
    return out;
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
