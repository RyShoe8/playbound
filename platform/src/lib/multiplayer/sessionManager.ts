import crypto from "node:crypto";
import dbConnect from "@/lib/db";
import MultiplayerSessionModel from "@/lib/models/MultiplayerSession";
import MultiplayerSignalModel from "@/lib/models/MultiplayerSignal";

export interface SignalingMessage {
  id: string;
  senderRole: "host" | "client";
  recipientRole: "host" | "client";
  senderPeerId: string;
  payload: string;
  timestamp: number;
}

export interface MultiplayerSession {
  sessionId: string;
  gameSlug: string;
  joinCode: string;
  gameVersion: string;
  modVersion?: string;
  packageHash?: string;
  maxPlayers: number;
  playerCount: number;
  status: "waiting" | "in_game" | "ended";
  createdAt: number;
  lastHeartbeat: number;
  extraConfig?: Record<string, unknown>;
}

type Role = "host" | "client";

const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const HEARTBEAT_TIMEOUT_MS = 60 * 1000;
const MESSAGE_TTL_MS = 2 * 60 * 1000;
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function secureEqualHash(token: string, expectedHash: string): boolean {
  if (!token || !expectedHash) return false;
  const actual = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function roomCode(): string {
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

function publicSession(doc: Record<string, unknown>): MultiplayerSession {
  return {
    sessionId: String(doc.sessionId),
    gameSlug: String(doc.gameSlug),
    joinCode: String(doc.joinCode),
    gameVersion: String(doc.gameVersion),
    modVersion: doc.modVersion ? String(doc.modVersion) : undefined,
    packageHash: doc.packageHash ? String(doc.packageHash) : undefined,
    maxPlayers: Number(doc.maxPlayers),
    playerCount: Number(doc.playerCount),
    status: doc.status as MultiplayerSession["status"],
    createdAt: new Date(doc.createdAt as string | Date).getTime(),
    lastHeartbeat: new Date(doc.lastHeartbeat as string | Date).getTime(),
    extraConfig:
      doc.extraConfig && typeof doc.extraConfig === "object"
        ? (doc.extraConfig as Record<string, unknown>)
        : undefined,
  };
}

function relayServers(sessionId: string) {
  const vpsIp = process.env.GAME_HOST_PUBLIC_IP;
  const stunPort = process.env.STUN_PORT || "3478";
  const stunServers = [
    ...(vpsIp ? [`stun:${vpsIp}:${stunPort}`] : []),
    "stun:stun.l.google.com:19302",
  ];
  const turnSecret = process.env.TURN_SHARED_SECRET;
  if (!vpsIp || !turnSecret) return { stunServers };

  const expires = Math.floor(Date.now() / 1000) + 60 * 60;
  const username = `${expires}:${sessionId}`;
  const credential = crypto
    .createHmac("sha1", turnSecret)
    .update(username)
    .digest("base64");
  return {
    stunServers,
    turnServers: [{ urls: `turn:${vpsIp}:${stunPort}`, username, credential }],
  };
}

function activeFilter(now = new Date()) {
  return {
    status: { $ne: "ended" },
    expiresAt: { $gt: now },
    lastHeartbeat: { $gt: new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS) },
  };
}

export async function purgeStaleSessions(): Promise<void> {
  await dbConnect();
  const now = new Date();
  const stale = await MultiplayerSessionModel.find({
    $or: [
      { status: "ended" },
      { expiresAt: { $lte: now } },
      { lastHeartbeat: { $lte: new Date(now.getTime() - HEARTBEAT_TIMEOUT_MS) } },
    ],
  })
    .select("sessionId")
    .lean();
  const ids = stale.map((row) => String(row.sessionId));
  if (!ids.length) return;
  await Promise.all([
    MultiplayerSessionModel.deleteMany({ sessionId: { $in: ids } }),
    MultiplayerSignalModel.deleteMany({ sessionId: { $in: ids } }),
  ]);
}

export async function createMultiplayerSession(params: {
  gameSlug?: string;
  gameVersion?: string;
  modVersion?: string;
  packageHash?: string;
  maxPlayers?: number;
  extraConfig?: Record<string, unknown>;
}): Promise<{
  session: MultiplayerSession & { hostToken: string };
  stunServers: string[];
  turnServers?: { urls: string; username: string; credential: string }[];
}> {
  await dbConnect();
  const hostToken = crypto.randomBytes(32).toString("base64url");
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const maxPlayers = Math.min(64, Math.max(1, Math.floor(params.maxPlayers || 4)));

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const created = await MultiplayerSessionModel.create({
        sessionId,
        gameSlug: String(params.gameSlug || "general").toLowerCase().slice(0, 100),
        joinCode: roomCode(),
        hostTokenHash: tokenHash(hostToken),
        gameVersion: String(params.gameVersion || "1.0").slice(0, 100),
        modVersion: params.modVersion ? String(params.modVersion).slice(0, 100) : null,
        packageHash: params.packageHash ? String(params.packageHash).slice(0, 200) : null,
        maxPlayers,
        playerCount: 1,
        status: "waiting",
        lastHeartbeat: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
        extraConfig: params.extraConfig || null,
      });
      const session = publicSession(created.toObject());
      return {
        session: { ...session, hostToken },
        ...relayServers(sessionId),
      };
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  throw new Error("Could not allocate a multiplayer room code");
}

export async function getMultiplayerSessionByCode(
  joinCode: string
): Promise<MultiplayerSession | null> {
  await dbConnect();
  const doc = await MultiplayerSessionModel.findOne({
    joinCode: joinCode.trim().toUpperCase(),
    ...activeFilter(),
  }).lean();
  return doc ? publicSession(doc as Record<string, unknown>) : null;
}

export async function getMultiplayerSessionById(
  sessionId: string
): Promise<MultiplayerSession | null> {
  await dbConnect();
  const doc = await MultiplayerSessionModel.findOne({
    sessionId,
    ...activeFilter(),
  }).lean();
  return doc ? publicSession(doc as Record<string, unknown>) : null;
}

export async function joinMultiplayerSession(joinCode: string): Promise<{
  session: MultiplayerSession;
  clientToken: string;
  stunServers: string[];
  turnServers?: { urls: string; username: string; credential: string }[];
} | null> {
  await dbConnect();
  const clientToken = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const doc = await MultiplayerSessionModel.findOneAndUpdate(
    {
      joinCode: joinCode.trim().toUpperCase(),
      ...activeFilter(now),
      $expr: { $lt: ["$playerCount", "$maxPlayers"] },
    },
    {
      $inc: { playerCount: 1 },
      $push: { clientTokenHashes: tokenHash(clientToken) },
      $set: { lastHeartbeat: now },
    },
    { new: true }
  ).lean();
  if (!doc) return null;
  const session = publicSession(doc as Record<string, unknown>);
  return { session, clientToken, ...relayServers(session.sessionId) };
}

async function hasCapability(sessionId: string, role: Role, token: string): Promise<boolean> {
  const doc = await MultiplayerSessionModel.findOne({
    sessionId,
    ...activeFilter(),
  })
    .select("+hostTokenHash +clientTokenHashes")
    .lean();
  if (!doc) return false;
  if (role === "host") return secureEqualHash(token, String(doc.hostTokenHash || ""));
  return ((doc.clientTokenHashes as string[] | undefined) || []).some((hash) =>
    secureEqualHash(token, hash)
  );
}

export async function postSessionSignal(
  sessionId: string,
  token: string,
  message: Omit<SignalingMessage, "id" | "timestamp">
): Promise<SignalingMessage | null> {
  await dbConnect();
  if (!(await hasCapability(sessionId, message.senderRole, token))) return null;
  const now = Date.now();
  const fullMessage: SignalingMessage = {
    ...message,
    senderPeerId: String(message.senderPeerId || "").slice(0, 100),
    payload: String(message.payload).slice(0, 100_000),
    id: crypto.randomUUID(),
    timestamp: now,
  };
  await Promise.all([
    MultiplayerSignalModel.create({
      signalId: fullMessage.id,
      sessionId,
      senderRole: fullMessage.senderRole,
      recipientRole: fullMessage.recipientRole,
      senderPeerId: fullMessage.senderPeerId,
      payload: fullMessage.payload,
      timestamp: now,
      expiresAt: new Date(now + MESSAGE_TTL_MS),
    }),
    MultiplayerSessionModel.updateOne(
      { sessionId, ...activeFilter(new Date(now)) },
      { $set: { lastHeartbeat: new Date(now) } }
    ),
  ]);
  return fullMessage;
}

export async function pollSessionSignals(
  sessionId: string,
  token: string,
  forRole: Role,
  sinceTimestamp = 0
): Promise<SignalingMessage[] | null> {
  await dbConnect();
  if (!(await hasCapability(sessionId, forRole, token))) return null;
  const rows = await MultiplayerSignalModel.find({
    sessionId,
    recipientRole: forRole,
    timestamp: { $gt: Math.max(0, sinceTimestamp) },
    expiresAt: { $gt: new Date() },
  })
    .sort({ timestamp: 1 })
    .limit(500)
    .lean();
  return rows.map((row) => ({
    id: String(row.signalId),
    senderRole: row.senderRole as Role,
    recipientRole: row.recipientRole as Role,
    senderPeerId: String(row.senderPeerId),
    payload: String(row.payload),
    timestamp: Number(row.timestamp),
  }));
}

export async function updateSessionStatus(
  sessionId: string,
  hostToken: string,
  playerCount?: number,
  status?: "waiting" | "in_game" | "ended"
): Promise<boolean> {
  await dbConnect();
  if (!(await hasCapability(sessionId, "host", hostToken))) return false;
  const $set: Record<string, unknown> = { lastHeartbeat: new Date() };
  if (Number.isSafeInteger(playerCount)) {
    $set.playerCount = Math.min(64, Math.max(1, Number(playerCount)));
  }
  if (status && ["waiting", "in_game", "ended"].includes(status)) $set.status = status;
  const result = await MultiplayerSessionModel.updateOne(
    { sessionId, ...activeFilter() },
    { $set }
  );
  return result.matchedCount === 1;
}

export async function deleteMultiplayerSession(
  sessionId: string,
  hostToken: string
): Promise<boolean> {
  await dbConnect();
  const doc = await MultiplayerSessionModel.findOne({ sessionId })
    .select("+hostTokenHash")
    .lean();
  if (!doc || !secureEqualHash(hostToken, String(doc.hostTokenHash || ""))) return false;
  await Promise.all([
    MultiplayerSessionModel.deleteOne({ sessionId }),
    MultiplayerSignalModel.deleteMany({ sessionId }),
  ]);
  return true;
}

export { relayServers as multiplayerRelayServers };
