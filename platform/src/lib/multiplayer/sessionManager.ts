import crypto from "crypto";

/**
 * Universal PlayBound Multiplayer Signaling & Session Manager.
 * Coordinates 6-character room codes (e.g. "7X4K9P"), peer presence, STUN/TURN endpoints,
 * and P2P rendezvous across all supported PlayBound multiplayer titles.
 */

export interface SignalingMessage {
  id: string;
  senderRole: "host" | "client";
  recipientRole: "host" | "client";
  senderPeerId: string;
  payload: string; // Serialized rendezvous / SDP blob
  timestamp: number;
}

export interface MultiplayerSession {
  sessionId: string;
  gameSlug: string;
  joinCode: string; // 6-character uppercase alphanumeric code (e.g. "7X4K9P")
  hostToken: string; // Secret token held by the host
  gameVersion: string;
  modVersion?: string;
  packageHash?: string;
  maxPlayers: number;
  playerCount: number;
  status: "waiting" | "in_game" | "ended";
  createdAt: number;
  lastHeartbeat: number;
  messages: SignalingMessage[];
  extraConfig?: Record<string, unknown>;
}

// In-memory active session store
const sessionsById = new Map<string, MultiplayerSession>();
const sessionsByJoinCode = new Map<string, string>(); // joinCode -> sessionId

// Configuration Constants
const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours max session age
const HEARTBEAT_TIMEOUT_MS = 60 * 1000; // 60s idle timeout if no heartbeat
const MESSAGE_TTL_MS = 2 * 60 * 1000; // 2 minutes message retention

// Ambiguity-free alphabet for 6-char room codes (excluding 0/O, 1/I/L)
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates an unguessable, collision-free 6-character room code.
 */
function generateRoomCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    if (!sessionsByJoinCode.has(code)) {
      return code;
    }
  }
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

/**
 * Clean up expired or stale sessions.
 */
export function purgeStaleSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessionsById.entries()) {
    if (
      now - session.lastHeartbeat > HEARTBEAT_TIMEOUT_MS ||
      now - session.createdAt > SESSION_TTL_MS ||
      session.status === "ended"
    ) {
      sessionsByJoinCode.delete(session.joinCode);
      sessionsById.delete(id);
    } else {
      session.messages = session.messages.filter(
        (m) => now - m.timestamp < MESSAGE_TTL_MS
      );
    }
  }
}

/**
 * Creates a new multiplayer session for any supported game title.
 */
export function createMultiplayerSession(params: {
  gameSlug?: string;
  gameVersion?: string;
  modVersion?: string;
  packageHash?: string;
  maxPlayers?: number;
  extraConfig?: Record<string, unknown>;
}): {
  session: MultiplayerSession;
  stunServers: string[];
  turnServers?: { urls: string; username?: string; credential?: string }[];
} {
  purgeStaleSessions();

  const sessionId = crypto.randomUUID();
  const joinCode = generateRoomCode();
  const hostToken = crypto.randomBytes(24).toString("hex");
  const now = Date.now();

  const session: MultiplayerSession = {
    sessionId,
    gameSlug: (params.gameSlug || "general").toLowerCase(),
    joinCode,
    hostToken,
    gameVersion: params.gameVersion || "1.0",
    modVersion: params.modVersion,
    packageHash: params.packageHash,
    maxPlayers: params.maxPlayers || 4,
    playerCount: 1,
    status: "waiting",
    createdAt: now,
    lastHeartbeat: now,
    messages: [],
    extraConfig: params.extraConfig,
  };

  sessionsById.set(sessionId, session);
  sessionsByJoinCode.set(joinCode, sessionId);

  const vpsIp = process.env.GAME_HOST_PUBLIC_IP || "127.0.0.1";
  const stunPort = process.env.STUN_PORT || "3478";

  return {
    session,
    stunServers: [`stun:${vpsIp}:${stunPort}`, "stun:stun.l.google.com:19302"],
    turnServers: [
      {
        urls: `turn:${vpsIp}:${stunPort}`,
        username: "playbound_guest",
        credential: "guest_session_token",
      },
    ],
  };
}

/**
 * Resolves a 6-character room code to an active session.
 */
export function getMultiplayerSessionByCode(joinCode: string): MultiplayerSession | null {
  purgeStaleSessions();
  const normalized = joinCode.trim().toUpperCase();
  const sessionId = sessionsByJoinCode.get(normalized);
  if (!sessionId) return null;
  return sessionsById.get(sessionId) || null;
}

/**
 * Retrieves a session by its unique ID.
 */
export function getMultiplayerSessionById(sessionId: string): MultiplayerSession | null {
  purgeStaleSessions();
  return sessionsById.get(sessionId) || null;
}

/**
 * Posts a signaling message to a session.
 */
export function postSessionSignal(
  sessionId: string,
  message: Omit<SignalingMessage, "id" | "timestamp">
): SignalingMessage | null {
  const session = getMultiplayerSessionById(sessionId);
  if (!session || session.status === "ended") return null;

  const fullMessage: SignalingMessage = {
    ...message,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };

  session.messages.push(fullMessage);
  session.lastHeartbeat = Date.now();
  return fullMessage;
}

/**
 * Retrieves pending signaling messages for a role.
 */
export function pollSessionSignals(
  sessionId: string,
  forRole: "host" | "client",
  sinceTimestamp = 0
): SignalingMessage[] {
  const session = getMultiplayerSessionById(sessionId);
  if (!session) return [];

  session.lastHeartbeat = Date.now();
  return session.messages.filter(
    (m) => m.recipientRole === forRole && m.timestamp > sinceTimestamp
  );
}

/**
 * Updates session heartbeat or status.
 */
export function updateSessionStatus(
  sessionId: string,
  playerCount?: number,
  status?: "waiting" | "in_game" | "ended"
): boolean {
  const session = sessionsById.get(sessionId);
  if (!session) return false;

  session.lastHeartbeat = Date.now();
  if (typeof playerCount === "number") session.playerCount = playerCount;
  if (status) session.status = status;
  return true;
}

/**
 * Ends and deletes an active session.
 */
export function deleteMultiplayerSession(sessionId: string, hostToken?: string): boolean {
  const session = sessionsById.get(sessionId);
  if (!session) return false;

  if (hostToken && session.hostToken !== hostToken) {
    return false;
  }

  sessionsByJoinCode.delete(session.joinCode);
  sessionsById.delete(sessionId);
  return true;
}
