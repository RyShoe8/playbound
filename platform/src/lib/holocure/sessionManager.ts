import {
  createMultiplayerSession,
  getMultiplayerSessionByCode,
  getMultiplayerSessionById,
  postSessionSignal,
  pollSessionSignals,
  updateSessionStatus,
  deleteMultiplayerSession,
  purgeStaleSessions,
  type MultiplayerSession,
  type SignalingMessage,
} from "@/lib/multiplayer/sessionManager";

export type { SignalingMessage };
export type HoloCureSession = MultiplayerSession;

export { purgeStaleSessions };

export function createSession(params: {
  gameVersion: string;
  modVersion: string;
  packageHash?: string;
  maxPlayers?: number;
}) {
  return createMultiplayerSession({
    gameSlug: "holocure",
    gameVersion: params.gameVersion,
    modVersion: params.modVersion,
    packageHash: params.packageHash,
    maxPlayers: params.maxPlayers,
  });
}

export function getSessionByCode(joinCode: string): HoloCureSession | null {
  return getMultiplayerSessionByCode(joinCode);
}

export function getSessionById(sessionId: string): HoloCureSession | null {
  return getMultiplayerSessionById(sessionId);
}

export function postSignalingMessage(
  sessionId: string,
  message: Omit<SignalingMessage, "id" | "timestamp">
) {
  return postSessionSignal(sessionId, message);
}

export function pollSignalingMessages(
  sessionId: string,
  forRole: "host" | "client",
  sinceTimestamp = 0
) {
  return pollSessionSignals(sessionId, forRole, sinceTimestamp);
}

export function updateSessionHeartbeat(
  sessionId: string,
  playerCount?: number,
  status?: "waiting" | "in_game" | "ended"
) {
  return updateSessionStatus(sessionId, playerCount, status);
}

export function endSession(sessionId: string, hostToken?: string) {
  return deleteMultiplayerSession(sessionId, hostToken);
}
