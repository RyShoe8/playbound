/**
 * Couch Mode session store — Mongo-backed for serverless, in-memory for tests.
 */

import crypto from "crypto";
import { COUCH_MAX_PLAYERS } from "./protocol";
import {
  defaultIceServers as sharedDefaultIceServers,
  sessionIceServers,
} from "@/lib/realtime/iceServers";
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

// Rolling cleanup horizon, renewed by the host heartbeat. It is not a cap on
// how long an active phone/controller session may keep playing one game.
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const MESSAGE_TTL_MS = 2 * 60 * 1000;
/** Admin streaming table: host heartbeat within this window counts as live. */
export const COUCH_ADMIN_LIVE_MS = 90_000;
/** Open session ends when the host stops heartbeating this long (launcher quit). */
export const COUCH_SESSION_STALE_MS = 5 * 60 * 1000;
/** @deprecated Use COUCH_SESSION_STALE_MS or COUCH_ADMIN_LIVE_MS */
export const COUCH_HOST_STALE_MS = COUCH_SESSION_STALE_MS;
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

async function withMongo(): Promise<boolean> {
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
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (await withMongo()) {
    const Model = await getModel();
    const payload = { ...session } as Record<string, unknown>;
    delete payload._id;
    delete payload.__v;
    // Signaling is appended atomically below. A snapshot saved by a concurrent
    // heartbeat or controller approval must never replace newer ICE messages.
    delete payload.messages;
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

export function isCouchHostLive(
  session: Pick<CouchSession, "status" | "lastHeartbeat">
): boolean {
  if (session.status !== "open") return false;
  return Date.now() - Number(session.lastHeartbeat || 0) <= COUCH_SESSION_STALE_MS;
}

async function dropIfStale(session: CouchSession | null): Promise<CouchSession | null> {
  if (!session || isCouchHostLive(session)) return session;
  await endCouchSession(session);
  return null;
}

async function loadById(sessionId: string): Promise<CouchSession | null> {
  let session: CouchSession | null = null;
  if (await withMongo()) {
    const Model = await getModel();
    const doc = await Model.findOne({ sessionId, status: "open" }).lean();
    session = doc ? (doc as unknown as CouchSession) : null;
  } else {
    session = memoryById.get(sessionId) || null;
  }
  return dropIfStale(session);
}

async function loadByCode(code: string): Promise<CouchSession | null> {
  const normalized = String(code || "").toUpperCase();
  let session: CouchSession | null = null;
  if (await withMongo()) {
    const Model = await getModel();
    const doc = await Model.findOne({ joinCode: normalized, status: "open" }).lean();
    session = doc ? (doc as unknown as CouchSession) : null;
  } else {
    const id = memoryByCode.get(normalized);
    session = id ? memoryById.get(id) || null : null;
  }
  return dropIfStale(session);
}

/** Remove open Couch rows whose host stopped heartbeating (launcher quit without DELETE). */
export async function purgeStaleCouchSessions(): Promise<number> {
  const cutoff = Date.now() - COUCH_SESSION_STALE_MS;
  if (await withMongo()) {
    const Model = await getModel();
    const res = await Model.deleteMany({
      status: "open",
      lastHeartbeat: { $lt: cutoff },
    });
    return res.deletedCount ?? 0;
  }
  let removed = 0;
  for (const session of memoryById.values()) {
    if (session.status === "open" && session.lastHeartbeat < cutoff) {
      await endCouchSession(session);
      removed += 1;
    }
  }
  return removed;
}

export async function createCouchSession(params: {
  hostLabel?: string;
  maxPlayers?: number;
  autoApprove?: boolean;
  /** Host physical pad owns OpenBOR P1 — remotes start at slot 1. */
  reserveHostSlot?: boolean;
}): Promise<CouchSession> {
  const existing = new Set<string>();
  if (await withMongo()) {
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
    reserveHostSlot: Boolean(params.reserveHostSlot),
    runtimeMetrics: null,
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
  const now = Date.now();
  const CONTROLLER_STALE_MS = 45_000;
  const used = new Set(
    session.controllers
      .filter(
        (c) =>
          c.status === "approved" &&
          c.playerSlot != null &&
          now - c.lastSeen <= CONTROLLER_STALE_MS
      )
      .map((c) => c.playerSlot as number)
  );
  // When the host physical pad owns OpenBOR P1 / joy0, remotes start at slot 1.
  const start = session.reserveHostSlot ? 1 : 0;
  for (let i = start; i < session.maxPlayers; i++) {
    if (!used.has(i)) return i;
  }
  return null;
}

export async function updateCouchController(
  session: CouchSession,
  params: {
    controllerId: string;
    controllerToken: string;
    label?: string;
    profile?: string;
    deviceLabel?: string;
  }
): Promise<{ ok: true; controller: CouchController } | { error: string; status: number }> {
  const existing = assertController(session, params.controllerId, params.controllerToken);
  if (!existing || existing.status === "kicked") {
    return { error: "Unauthorized.", status: 401 };
  }
  const now = Date.now();
  existing.lastSeen = now;
  if (params.label) existing.label = params.label.slice(0, 64);
  if (params.deviceLabel) existing.deviceLabel = params.deviceLabel.slice(0, 80);
  if (params.profile) existing.profile = params.profile.slice(0, 40);
  session.lastHeartbeat = now;
  if (await withMongo()) {
    const Model = await getModel();
    await Model.updateOne(
      {
        sessionId: session.sessionId,
        status: "open",
        "controllers.controllerId": existing.controllerId,
      },
      {
        $set: {
          "controllers.$": existing,
        },
        $max: { lastHeartbeat: now },
      }
    );
  } else {
    await saveSession(session);
  }
  return { ok: true, controller: existing };
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
      session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
      if (await withMongo()) {
        const Model = await getModel();
        await Model.updateOne(
          {
            sessionId: session.sessionId,
            status: "open",
            "controllers.controllerId": existing.controllerId,
          },
          {
            $set: {
              "controllers.$": existing,
              expiresAt: session.expiresAt,
            },
            $max: { lastHeartbeat: now },
          }
        );
      } else {
        await saveSession(session);
      }
      return { controller: existing, reconnect: true };
    }
  }

  const CONTROLLER_STALE_MS = 45_000;
  const approvedCount = session.controllers.filter(
    (c) => c.status === "approved" && now - c.lastSeen <= CONTROLLER_STALE_MS
  ).length;
  const pendingCount = session.controllers.filter(
    (c) => c.status === "pending" && now - c.lastSeen <= CONTROLLER_STALE_MS
  ).length;
  if (approvedCount + pendingCount >= session.maxPlayers) {
    return { error: "Session is full.", status: 409 };
  }

  const controller: CouchController = {
    controllerId: crypto.randomUUID(),
    controllerToken: randomToken(16),
    sessionToken: null,
    label: (params.label || "Controller").slice(0, 64),
    profile: (params.profile || "keyboard-mouse").slice(0, 40),
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
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (await withMongo()) {
    const Model = await getModel();
    await Model.updateOne(
      { sessionId: session.sessionId, status: "open" },
      {
        $push: { controllers: controller },
        $set: { expiresAt: session.expiresAt },
        $max: { lastHeartbeat: now },
      }
    );
  } else {
    await saveSession(session);
  }
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
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (await withMongo()) {
    const Model = await getModel();
    await Model.updateOne(
      {
        sessionId: session.sessionId,
        status: "open",
        "controllers.controllerId": c.controllerId,
      },
      {
        $set: {
          "controllers.$": c,
          expiresAt: session.expiresAt,
        },
        $max: { lastHeartbeat: c.lastSeen },
      }
    );
  } else {
    await saveSession(session);
  }
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
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (await withMongo()) {
    const Model = await getModel();
    await Model.updateOne(
      {
        sessionId: session.sessionId,
        status: "open",
        "controllers.controllerId": c.controllerId,
      },
      {
        $set: {
          "controllers.$": c,
          expiresAt: session.expiresAt,
        },
        $max: { lastHeartbeat: c.lastSeen },
      }
    );
  } else {
    await saveSession(session);
  }
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
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (await withMongo()) {
    const Model = await getModel();
    await Model.updateOne(
      { sessionId: session.sessionId, status: "open" },
      {
        $set: {
          controllers: session.controllers,
          expiresAt: session.expiresAt,
        },
        $max: { lastHeartbeat: c.lastSeen },
      }
    );
  } else {
    await saveSession(session);
  }
  return c;
}

export async function setHostEndpoints(
  session: CouchSession,
  endpoints: CouchHostEndpoints
): Promise<void> {
  session.hostEndpoints = {
    wsUrls: Array.isArray(endpoints.wsUrls) ? endpoints.wsUrls.slice(0, 8) : [],
    wsToken: String(endpoints.wsToken || "").slice(0, 128),
    // Platform owns ICE (STUN + TURN). Ignore host-published iceServers so a
    // narrow launcher list cannot wipe coturn / expanded STUN on join.
  };
  const now = Date.now();
  session.lastHeartbeat = now;
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (await withMongo()) {
    const Model = await getModel();
    await Model.updateOne(
      { sessionId: session.sessionId, status: "open" },
      {
        $set: {
          hostEndpoints: session.hostEndpoints,
          expiresAt: session.expiresAt,
        },
        $max: { lastHeartbeat: now },
      }
    );
    return;
  }
  memoryById.set(session.sessionId, session);
}

export async function heartbeatHost(session: CouchSession): Promise<void> {
  const now = Date.now();
  session.lastHeartbeat = now;
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (await withMongo()) {
    const Model = await getModel();
    await Model.updateOne(
      { sessionId: session.sessionId, status: "open" },
      {
        $max: { lastHeartbeat: now },
        $set: { expiresAt: session.expiresAt },
      }
    );
    return;
  }
  memoryById.set(session.sessionId, session);
}

/** Keep the session alive while a guest is polling/signaling (host may be mid-launch). */
export async function touchCouchSessionActivity(
  session: CouchSession,
  controller?: CouchController | null
): Promise<void> {
  const now = Date.now();
  session.lastHeartbeat = now;
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (controller) controller.lastSeen = now;
  if (await withMongo()) {
    const Model = await getModel();
    if (controller) {
      await Model.updateOne(
        {
          sessionId: session.sessionId,
          status: "open",
          "controllers.controllerId": controller.controllerId,
        },
        {
          $max: {
            lastHeartbeat: now,
            "controllers.$.lastSeen": now,
          },
          $set: { expiresAt: session.expiresAt },
        }
      );
    } else {
      await Model.updateOne(
        { sessionId: session.sessionId, status: "open" },
        {
          $max: { lastHeartbeat: now },
          $set: { expiresAt: session.expiresAt },
        }
      );
    }
    return;
  }
  memoryById.set(session.sessionId, session);
}

export async function endCouchSession(session: CouchSession): Promise<void> {
  session.status = "ended";
  if (await withMongo()) {
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
  if (await withMongo()) {
    const Model = await getModel();
    const result = await Model.updateOne(
      { sessionId: session.sessionId, status: "open" },
      {
        $push: { messages: { $each: [message], $slice: -1024 } },
        $max: { lastHeartbeat: message.timestamp },
      }
    );
    if (result.matchedCount === 0) return null;
  } else {
    session.messages.push(message);
    session.lastHeartbeat = message.timestamp;
    await saveSession(session);
  }
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

export async function setRuntimeMetrics(
  session: CouchSession,
  metrics: Record<string, unknown>
): Promise<void> {
  session.runtimeMetrics = metrics;
  const now = Date.now();
  session.lastHeartbeat = now;
  session.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  if (await withMongo()) {
    const Model = await getModel();
    await Model.updateOne(
      { sessionId: session.sessionId, status: "open" },
      {
        $set: {
          runtimeMetrics: session.runtimeMetrics,
          expiresAt: session.expiresAt,
        },
        $max: { lastHeartbeat: now },
      }
    );
    return;
  }
  memoryById.set(session.sessionId, session);
}

export function publicCouchSnapshot(session: CouchSession) {
  const iceServers = sessionIceServers(session.sessionId);
  return {
    sessionId: session.sessionId,
    joinCode: session.joinCode,
    hostLabel: session.hostLabel,
    status: session.status,
    maxPlayers: session.maxPlayers,
    autoApprove: session.autoApprove,
    reserveHostSlot: Boolean(session.reserveHostSlot),
    hostEndpoints: session.hostEndpoints
      ? {
          wsUrls: session.hostEndpoints.wsUrls,
          iceServers,
        }
      : { iceServers },
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

export function hostCouchSnapshot(session: CouchSession) {
  const pub = publicCouchSnapshot(session);
  return {
    ...pub,
    hostToken: session.hostToken,
    controllers: session.controllers
      .filter((c) => c.status !== "kicked")
      .map((c) => ({
        controllerId: c.controllerId,
        label: c.label,
        deviceLabel: c.deviceLabel,
        profile: c.profile,
        status: c.status,
        playerSlot: c.playerSlot,
        sessionToken: c.sessionToken,
        createdAt: c.createdAt,
      })),
  };
}

/** @deprecated Prefer sessionIceServers(sessionId); kept for callers without a session. */
export function defaultIceServers(): { urls: string }[] {
  return sharedDefaultIceServers() as { urls: string }[];
}

export { sessionIceServers };
