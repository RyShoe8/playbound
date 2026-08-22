/**
 * Couch Mode session store — Mongo-backed for serverless, in-memory for tests.
 */

import crypto from "crypto";
import { COUCH_MAX_PLAYERS } from "./protocol";
import type {
  ICouchController,
  ICouchHostEndpoints,
  ICouchSession,
  ICouchSignalingMessage,
} from "@/lib/models/CouchSession";

export type CouchController = ICouchController;
export type CouchSignalingMessage = ICouchSignalingMessage;
export type CouchHostEndpoints = ICouchHostEndpoints;
export type CouchSession = ICouchSession;

type StoreMode = "auto" | "memory" | "mongo";

let storeMode: StoreMode = "auto";
const memoryById = new Map<string, CouchSession>();
const memoryByCode = new Map<string, string>();

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const MESSAGE_TTL_MS = 2 * 60 * 1000;
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Force memory store (unit tests). */
export function setCouchStoreMode(mode: StoreMode) {
  storeMode = mode;
}

function generateRoomCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
    }
    if (!existing.has(code)) return code;
  }
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("hex");
}

async function useMongo(): Promise<boolean> {
  if (storeMode === "memory") return false;
  if (storeMode === "mongo") return true;
  try {
    const mongoose = await import("mongoose");
    return mongoose.default.connection.readyState === 1;
  } catch {
    return false;
  }
}

async function getModel() {
  const mod = await import("@/lib/models/CouchSession");
  return mod.default;
}

function trimMessages(session: CouchSession) {
  const cutoff = Date.now() - MESSAGE_TTL_MS;
  session.messages = (session.messages || []).filter((m) => m.timestamp >= cutoff);
}

async function saveSession(session: CouchSession): Promise<void> {
  trimMessages(session);
  session.expiresAt = new Date(session.createdAt + SESSION_TTL_MS);
  if (await useMongo()) {
    const Model = await getModel();
    const payload = { ...session } as Record<string, unknown>;
    delete payload._id;
    delete payload.__v;
    await Model.findOneAndUpdate(
      { sessionId: session.sessionId },
      { $set: payload },
      { upsert: true }
    );
    return;
  }
  memoryById.set(session.sessionId, session);
  memoryByCode.set(session.joinCode, session.sessionId);
}

async function loadById(sessionId: string): Promise<CouchSession | null> {
  if (await useMongo()) {
    const Model = await getModel();
    const doc = await Model.findOne({ sessionId, status: "open" }).lean();
    return doc ? (doc as unknown as CouchSession) : null;
  }
  return memoryById.get(sessionId) || null;
}

async function loadByCode(code: string): Promise<CouchSession | null> {
  const normalized = String(code || "").toUpperCase();
  if (await useMongo()) {
    const Model = await getModel();
    const doc = await Model.findOne({ joinCode: normalized, status: "open" }).lean();
    return doc ? (doc as unknown as CouchSession) : null;
  }
  const id = memoryByCode.get(normalized);
  if (!id) return null;
  return memoryById.get(id) || null;
}

export async function createCouchSession(params: {
  hostLabel?: string;
  maxPlayers?: number;
  autoApprove?: boolean;
}): Promise<CouchSession> {
  const existing = new Set<string>();
  if (await useMongo()) {
    const Model = await getModel();
    const rows = await Model.find({ status: "open" }).select("joinCode").lean();
    for (const r of rows) existing.add(String((r as { joinCode: string }).joinCode));
  } else {
    for (const c of memoryByCode.keys()) existing.add(c);
  }

  const now = Date.now();
  const session: CouchSession = {
    sessionId: crypto.randomUUID(),
    joinCode: generateRoomCode(existing),
    hostToken: randomToken(24),
    hostLabel: (params.hostLabel || "PlayBound").slice(0, 64),
    status: "open",
    maxPlayers: Math.min(
      COUCH_MAX_PLAYERS,
      Math.max(1, params.maxPlayers ?? COUCH_MAX_PLAYERS)
    ),
    createdAt: now,
    lastHeartbeat: now,
    controllers: [],
    messages: [],
    hostEndpoints: null,
    autoApprove: params.autoApprove !== false,
    expiresAt: new Date(now + SESSION_TTL_MS),
  };
  await saveSession(session);
  return session;
}

export async function getCouchSession(sessionId: string): Promise<CouchSession | null> {
  return loadById(sessionId);
}

export async function getCouchSessionByCode(code: string): Promise<CouchSession | null> {
  return loadByCode(code);
}

export function assertHost(session: CouchSession, hostToken: string): boolean {
  return Boolean(hostToken) && session.hostToken === hostToken;
}

function findController(session: CouchSession, controllerId: string): CouchController | null {
  return session.controllers.find((c) => c.controllerId === controllerId) || null;
}

export function assertController(
  session: CouchSession,
  controllerId: string,
  controllerToken: string
): CouchController | null {
  const c = findController(session, controllerId);
  if (!c || c.controllerToken !== controllerToken) return null;
  return c;
}

function nextFreeSlot(session: CouchSession): number | null {
  const used = new Set(
    session.controllers
      .filter((c) => c.status === "approved" && c.playerSlot != null)
      .map((c) => c.playerSlot as number)
  );
  for (let i = 0; i < session.maxPlayers; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

export async function joinCouchSession(
  session: CouchSession,
  params: {
    label?: string;
    profile?: string;
    deviceLabel?: string;
    controllerId?: string;
    controllerToken?: string;
  }
): Promise<{ controller: CouchController; reconnect: boolean } | { error: string; status: number }> {
  if (session.status !== "open") {
    return { error: "Session ended.", status: 410 };
  }

  const now = Date.now();

  if (params.controllerId && params.controllerToken) {
    const existing = assertController(session, params.controllerId, params.controllerToken);
    if (existing && existing.status !== "kicked") {
      existing.lastSeen = now;
      existing.label = (params.label || existing.label).slice(0, 64);
      if (params.deviceLabel) existing.deviceLabel = params.deviceLabel.slice(0, 80);
      if (params.profile) existing.profile = params.profile.slice(0, 40);
      if (existing.status === "approved" && existing.playerSlot == null) {
        existing.playerSlot = nextFreeSlot(session);
      }
      if (existing.status === "approved" && !existing.sessionToken) {
        existing.sessionToken = randomToken(16);
      }
      session.lastHeartbeat = now;
      await saveSession(session);
      return { controller: existing, reconnect: true };
    }
  }

  const approvedCount = session.controllers.filter((c) => c.status === "approved").length;
  const pendingCount = session.controllers.filter((c) => c.status === "pending").length;
  if (approvedCount + pendingCount >= session.maxPlayers) {
    return { error: "Session is full.", status: 409 };
  }

  const controller: CouchController = {
    controllerId: crypto.randomUUID(),
    controllerToken: randomToken(16),
    sessionToken: null,
    label: (params.label || "Phone").slice(0, 64),
    profile: (params.profile || "touch-gamepad").slice(0, 40),
    status: "pending",
    playerSlot: null,
    createdAt: now,
    lastSeen: now,
    deviceLabel: params.deviceLabel?.slice(0, 80),
  };

  if (session.autoApprove) {
    const slot = nextFreeSlot(session);
    if (slot == null) return { error: "Session is full.", status: 409 };
    controller.status = "approved";
    controller.playerSlot = slot;
    controller.sessionToken = randomToken(16);
  }

  session.controllers.push(controller);
  session.lastHeartbeat = now;
  await saveSession(session);
  return { controller, reconnect: false };
}

export async function approveController(
  session: CouchSession,
  controllerId: string
): Promise<CouchController | { error: string; status: number }> {
  const c = findController(session, controllerId);
  if (!c) return { error: "Controller not found.", status: 404 };
  if (c.status === "kicked") return { error: "Controller was kicked.", status: 403 };
  if (c.status === "approved") return c;
  const slot = nextFreeSlot(session);
  if (slot == null) return { error: "No free player slots.", status: 409 };
  c.status = "approved";
  c.playerSlot = slot;
  c.sessionToken = randomToken(16);
  c.lastSeen = Date.now();
  session.lastHeartbeat = c.lastSeen;
  await saveSession(session);
  return c;
}

export async function rejectOrKickController(
  session: CouchSession,
  controllerId: string
): Promise<boolean> {
  const c = findController(session, controllerId);
  if (!c) return false;
  c.status = "kicked";
  c.playerSlot = null;
  c.sessionToken = null;
  c.lastSeen = Date.now();
  session.lastHeartbeat = c.lastSeen;
  await saveSession(session);
  return true;
}

export async function reassignSlot(
  session: CouchSession,
  controllerId: string,
  playerSlot: number
): Promise<CouchController | { error: string; status: number }> {
  if (playerSlot < 0 || playerSlot >= session.maxPlayers) {
    return { error: "Invalid slot.", status: 400 };
  }
  const c = findController(session, controllerId);
  if (!c || c.status !== "approved") return { error: "Controller not approved.", status: 404 };
  const occupant = session.controllers.find(
    (x) => x.status === "approved" && x.playerSlot === playerSlot && x.controllerId !== controllerId
  );
  if (occupant) {
    occupant.playerSlot = c.playerSlot;
  }
  c.playerSlot = playerSlot;
  c.lastSeen = Date.now();
  session.lastHeartbeat = c.lastSeen;
  await saveSession(session);
  return c;
}

export async function setHostEndpoints(
  session: CouchSession,
  endpoints: CouchHostEndpoints
): Promise<void> {
  session.hostEndpoints = {
    wsUrls: Array.isArray(endpoints.wsUrls) ? endpoints.wsUrls.slice(0, 8) : [],
    wsToken: String(endpoints.wsToken || "").slice(0, 128),
    iceServers: endpoints.iceServers,
  };
  session.lastHeartbeat = Date.now();
  await saveSession(session);
}

export async function heartbeatHost(session: CouchSession): Promise<void> {
  session.lastHeartbeat = Date.now();
  await saveSession(session);
}

export async function endCouchSession(session: CouchSession): Promise<void> {
  session.status = "ended";
  if (await useMongo()) {
    const Model = await getModel();
    await Model.deleteOne({ sessionId: session.sessionId });
  } else {
    memoryByCode.delete(session.joinCode);
    memoryById.delete(session.sessionId);
  }
}

export async function postCouchSignal(
  session: CouchSession,
  msg: {
    senderRole: "host" | "controller";
    recipientRole: "host" | "controller";
    senderPeerId: string;
    payload: string;
  }
): Promise<CouchSignalingMessage | null> {
  if (session.status !== "open") return null;
  const message: CouchSignalingMessage = {
    id: crypto.randomUUID(),
    senderRole: msg.senderRole,
    recipientRole: msg.recipientRole,
    senderPeerId: String(msg.senderPeerId || "").slice(0, 80),
    payload: String(msg.payload || "").slice(0, 64_000),
    timestamp: Date.now(),
  };
  session.messages.push(message);
  session.lastHeartbeat = message.timestamp;
  await saveSession(session);
  return message;
}

export function pollCouchSignals(
  session: CouchSession,
  forRole: "host" | "controller",
  since: number
): CouchSignalingMessage[] {
  return (session.messages || []).filter(
    (m) => m.recipientRole === forRole && m.timestamp > since
  );
}

export function publicCouchSnapshot(session: CouchSession) {
  return {
    sessionId: session.sessionId,
    joinCode: session.joinCode,
    hostLabel: session.hostLabel,
    status: session.status,
    maxPlayers: session.maxPlayers,
    autoApprove: session.autoApprove,
    hostEndpoints: session.hostEndpoints
      ? {
          wsUrls: session.hostEndpoints.wsUrls,
          iceServers: session.hostEndpoints.iceServers || defaultIceServers(),
        }
      : { iceServers: defaultIceServers() },
    controllers: session.controllers
      .filter((c) => c.status !== "kicked")
      .map((c) => ({
        controllerId: c.controllerId,
        label: c.label,
        deviceLabel: c.deviceLabel,
        profile: c.profile,
        status: c.status,
        playerSlot: c.playerSlot,
      })),
  };
}

export function defaultIceServers(): { urls: string }[] {
  return [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
}
