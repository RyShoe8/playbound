import { randomUUID } from "node:crypto";
import dbConnect from "@/lib/db";
import CommunityHostingConfig from "@/lib/models/CommunityHostingConfig";
import CommunityHostingLease from "@/lib/models/CommunityHostingLease";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import CommunityServer from "@/lib/models/CommunityServer";
import CapacityReservation from "@/lib/models/CapacityReservation";
import PlatformEvent from "@/lib/models/PlatformEvent";
import AutomatedEventConfig from "@/lib/models/AutomatedEventConfig";
import { fetchGameHostMetrics, listManagedHostRooms, requestManagedHostRoom, stopManagedHostRoom } from "@/lib/gameHost/client";
import { placementDecision, type ResourceEnvelope } from "./capacity";
import { queryManagedPlayerCount } from "./playerQuery";
import { recordResourceSample } from "./samples";
import { rotationPriority } from "./rotation";
import { saveEvent } from "@/lib/telemetry/server/saveEvent";

export const DEFAULT_COMMUNITY_SERVER_ENVELOPE: ResourceEnvelope = {
  cpuCores: 1.0,
  ramBytes: 1536 * 1024 * 1024, // 1.5 GB default baseline
};

const HEAVY_GAME_ENVELOPES: Record<string, ResourceEnvelope> = {
  "counter-strike-2": { cpuCores: 2.0, ramBytes: 2560 * 1024 * 1024 },
  "morrowind": { cpuCores: 1.5, ramBytes: 2048 * 1024 * 1024 },
  "veloren": { cpuCores: 1.5, ramBytes: 2048 * 1024 * 1024 },
  "team-fortress-2": { cpuCores: 1.5, ramBytes: 2048 * 1024 * 1024 },
};

export function getEffectiveEnvelope(
  envelope?: { cpuCores?: number; ramBytes?: number } | null,
  gameSlug?: string,
  sampleCount?: number
): ResourceEnvelope {
  const fallback = (gameSlug && HEAVY_GAME_ENVELOPES[gameSlug]) || DEFAULT_COMMUNITY_SERVER_ENVELOPE;
  const cpu = Number(envelope?.cpuCores);
  const ram = Number(envelope?.ramBytes);
  // Unmeasured profiles or legacy dummy (0.25 cores / 512 MB) must always use realistic baseline/heavy envelopes
  if (!sampleCount || sampleCount <= 0 || !Number.isFinite(cpu) || cpu <= 0.25 || !Number.isFinite(ram) || ram <= 512 * 1024 * 1024) {
    return fallback;
  }
  return {
    cpuCores: Math.max(0.75, cpu),
    ramBytes: Math.max(1024 * 1024 * 1024, ram),
  };
}

const LEASE_MS = 2 * 60_000;

// These methods are selected by the actual hosted game, then recorded on the
// profile only after a live response. A running process alone is not proof.
const QUERY_BY_GAME: Record<string, "a2s-local" | "hurry-curry-registry" | "openra-master"> = {
  "counter-strike-2": "a2s-local",
  "hurry-curry": "hurry-curry-registry",
  "earth-2140-trilogy": "openra-master",
};

async function recordHostingAction(event: string, server: { gameSlug: string; editionSlug?: string | null; profileKey: string; name?: string }, reason?: string | null) {
  try {
    await saveEvent({ event, properties: {
      source: "website", area: "hosting", gameSlug: server.gameSlug,
      editionSlug: server.editionSlug || null, profileKey: server.profileKey,
      serverName: server.name || null,
      ...(reason ? { code: reason.slice(0, 80), message: reason.slice(0, 500), phase: "reconcile" } : {}),
    } });
  } catch (error) {
    // Observability must never change whether a server starts or stops.
    console.warn("[community-hosting] telemetry unavailable:", error instanceof Error ? error.message : error);
  }
}

async function acquireLease(now: Date): Promise<string | null> {
  const owner = randomUUID();
  try {
    const result = await CommunityHostingLease.findOneAndUpdate(
      { key: "fleet", $or: [{ leaseUntil: { $lt: now } }, { leaseUntil: null }] },
      { $set: { leaseUntil: new Date(now.getTime() + LEASE_MS), owner }, $setOnInsert: { key: "fleet" } },
      { new: true, upsert: true }
    );
    return result?.owner === owner ? owner : null;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) return null;
    throw error;
  }
}

async function syncReservations(now: Date, regionKey: string) {
  const expired = await CapacityReservation.find({ state: { $in: ["planned", "active"] }, protectedUntil: { $lt: now } }).select({ _id: 1, eventId: 1, communityServerId: 1 }).lean();
  for (const reservation of expired) {
    await CapacityReservation.updateOne({ _id: reservation._id }, { $set: { state: "released", decisionReason: "PROTECTION_ENDED" } });
    if (reservation.communityServerId) {
      await CommunityServer.updateOne({ _id: reservation.communityServerId, linkedEventId: reservation.eventId }, { $set: { linkedEventId: null, protectedUntil: null } });
    }
  }
  const nightly = await AutomatedEventConfig.findOne({ key: "global" }).select({ nightly: 1 }).lean();
  const warmupHours = nightly?.nightly?.warmupHours ?? 4;
  const graceHours = nightly?.nightly?.graceHours ?? 1;
  const events = await PlatformEvent.find({
    generatedBy: "game_night_planner", startsAt: { $gte: now, $lt: new Date(now.getTime() + 8 * 86_400_000) },
    status: { $ne: "cancelled" },
  }).select({ _id: 1, gameSlug: 1, editionSlug: 1, startsAt: 1, endsAt: 1 }).lean();
  const profiles = await CommunityServerProfile.find({ enabled: true }).lean();
  const wanted = new Set<string>();
  for (const event of events) {
    const profile = profiles.find((p) => p.gameSlug === event.gameSlug && (p.editionSlug || null) === (event.editionSlug || null));
    if (!profile) continue;
    const envelope = getEffectiveEnvelope(profile.envelope, profile.gameSlug);
    const sourceKey = `event:${event._id}`;
    wanted.add(sourceKey);
    const existingReservation = await CapacityReservation.findOne({ sourceKey }).select({ profileKey: 1, communityServerId: 1, state: 1 }).lean();
    const profileChanged = existingReservation && existingReservation.profileKey !== profile.key;
    if (profileChanged && existingReservation.communityServerId) {
      await CommunityServer.updateOne(
        { _id: existingReservation.communityServerId, linkedEventId: event._id },
        { $set: { linkedEventId: null, protectedUntil: null } }
      );
    }
    const startsAt = new Date(event.startsAt);
    const endsAt = event.endsAt ? new Date(event.endsAt) : new Date(startsAt.getTime() + 2 * 3_600_000);
    await CapacityReservation.updateOne({ sourceKey }, {
      $set: {
        profileKey: profile.key, regionKey, cpuCores: envelope.cpuCores,
        ramBytes: envelope.ramBytes,
        warmupAt: new Date(startsAt.getTime() - warmupHours * 3_600_000),
        protectedUntil: new Date(endsAt.getTime() + graceHours * 3_600_000),
        ...(profileChanged || existingReservation?.state === "released" ? { communityServerId: null, state: "planned", decisionReason: null } : {}),
      },
      $setOnInsert: { eventId: event._id, sourceKey, state: "planned" },
    }, { upsert: true });
  }
  const pending = await CapacityReservation.find({ state: { $in: ["planned", "active"] }, protectedUntil: { $gte: now } })
    .select({ sourceKey: 1, eventId: 1, communityServerId: 1, profileKey: 1 }).lean();
  for (const reservation of pending) {
    if (!wanted.has(reservation.sourceKey)) {
      const event = await PlatformEvent.findById(reservation.eventId).select({ status: 1, gameSlug: 1, editionSlug: 1 }).lean();
      const stillMatches = profiles.some((p) => p.key === reservation.profileKey && p.gameSlug === event?.gameSlug && (p.editionSlug || null) === (event?.editionSlug || null));
      if (!event || event.status === "cancelled" || !stillMatches) {
        await CapacityReservation.updateOne({ _id: reservation._id }, { $set: { state: "released", decisionReason: !event || event.status === "cancelled" ? "EVENT_CANCELLED" : "PROFILE_CHANGED_OR_UNVERIFIED" } });
        if (reservation.communityServerId) {
          await CommunityServer.updateOne({ _id: reservation.communityServerId, linkedEventId: reservation.eventId }, { $set: { linkedEventId: null, protectedUntil: null } });
        }
      }
    }
  }
}

function nodePlacementMetrics(metrics: {
  collectedAt?: string;
  cpu?: { cores?: number; load1?: number; usagePercent?: number | null };
  memory?: { freeBytes?: number; totalBytes?: number };
}) {
  if (!metrics.cpu?.cores || metrics.memory?.freeBytes == null || !metrics.memory?.totalBytes) return null;
  const cpuPercent = metrics.cpu.usagePercent != null
    ? metrics.cpu.usagePercent
    : (metrics.cpu.load1 != null ? Math.min(100, Math.round((metrics.cpu.load1 / metrics.cpu.cores) * 100)) : 5);
  return {
    collectedAt: metrics.collectedAt || "",
    cpuCores: metrics.cpu.cores,
    cpuUsagePercent: cpuPercent,
    freeRamBytes: metrics.memory.freeBytes,
    totalRamBytes: metrics.memory.totalBytes,
  };
}

export async function reconcileCommunityHosting(now = new Date()): Promise<{ action: string; reason?: string }> {
  await dbConnect();
  const config = await CommunityHostingConfig.findOne({ key: "global" }).lean();
  if (!config?.enabled) return { action: "disabled" };
  const owner = await acquireLease(now);
  if (!owner) return { action: "busy" };
  try {
    const [metricResult, agent] = await Promise.all([fetchGameHostMetrics(), listManagedHostRooms()]);
    if (!metricResult.ok || !agent.ok) {
      const reason = !metricResult.ok ? metricResult.error : (agent.ok ? "NO_HEALTHY_NODE" : agent.error);
      await saveEvent({
        event: "community_server_reconcile_failed",
        properties: {
          source: "website", area: "hosting", origin: "server",
          code: "NO_HEALTHY_NODE", message: reason || "Node metrics or agent unreachable", phase: "reconcile",
        },
      }).catch(() => undefined);
      return { action: "waiting", reason: "NO_HEALTHY_NODE" };
    }
    const metrics = metricResult.metrics;
    const profiles = await CommunityServerProfile.find({ enabled: true }).lean();
    const profileByKey = new Map(profiles.map((p) => [p.key, p]));
    await syncReservations(now, config.node.regionKey);
    const active = await CommunityServer.find({
      regionKey: config.node.regionKey,
      $or: [
        { desiredState: "running" },
        { runtimeState: { $in: ["running", "pending", "starting"] } },
      ],
    });
    const managedById = new Map(agent.rooms.filter((r) => r.communityServerId).map((r) => [r.communityServerId!, r]));
    const lost: typeof active = [];
    for (const server of active) {
      const room = managedById.get(String(server._id));
      const profile = profileByKey.get(server.profileKey);
      if (!room) {
        const job = agent.jobs[String(server._id)];
        const prevRuntime = server.runtimeState;
        if (job?.status === "pending") {
          server.runtimeState = "pending";
          server.health = "unknown";
          server.playerCount = null;
          server.decisionReason = "STARTING_PENDING";
          await server.save();
        } else {
          // If the runtime is not on the host, mark it stopped so it does not stay stuck in pending
          server.desiredState = "stopped";
          server.runtimeState = "stopped";
          server.health = "unknown";
          server.playerCount = null;
          server.decisionReason = job?.error || (job?.status === "failed" ? "Failed to start" : "Stopped");
          await server.save();
          if (job?.status === "failed" || prevRuntime === "running") {
            await recordHostingAction("community_server_failed", server, job?.error || "Runtime exited unexpectedly");
          }
        }
        continue;
      }
      const queryKind = profile?.queryVerified ? profile.queryKind : QUERY_BY_GAME[server.gameSlug];
      const players = queryKind
        ? await queryManagedPlayerCount({ queryKind, host: room.host, port: room.port, communityServerId: String(server._id), expectedMod: server.gameSlug === "earth-2140-trilogy" ? "e2140" : undefined })
        : null;
      if (players !== null && profile && !profile.queryVerified && queryKind) {
        await CommunityServerProfile.updateOne(
          { key: profile.key, queryVerified: false },
          { $set: { queryKind, queryVerified: true, lastVerifiedAt: now } }
        );
      }
      server.runtimeId = room.roomId;
      server.host = room.host;
      server.port = room.port;
      server.desiredState = "running";
      server.runtimeState = "running";
      server.health = players === null ? "unknown" : "healthy";
      server.playerCount = players;
      server.playerCountCheckedAt = players === null ? null : now;
      if (players !== null && players > 0) server.lastOccupiedAt = now;
      if (!server.onlineSince) server.onlineSince = now;
      server.lastReconciledAt = now;
      server.decisionReason = players === null ? "PLAYER_QUERY_UNKNOWN" : "RUNNING";
      server.recoveryAttempts = 0;
      server.nextRecoveryAt = null;
      await server.save();
      if (profile && room.resources?.available && room.resources.cpuCores != null && room.resources.rssBytes) {
        await recordResourceSample({
          profileKey: profile.key, communityServerId: String(server._id), observedAt: now,
          players, cpuCores: room.resources.cpuCores, ramBytes: room.resources.rssBytes,
          nodeCpuPercent: metrics.cpu?.usagePercent, nodeRamPercent: metrics.memory?.usedPercent,
          phase: players === null || players === 0 ? "idle" : "occupied", source: "live",
        });
      }
    }

    const reservations = await CapacityReservation.find({
      state: { $in: ["planned", "active"] }, regionKey: config.node.regionKey,
      warmupAt: { $lte: new Date(now.getTime() + 6 * 3_600_000) }, protectedUntil: { $gte: now },
    }).sort({ warmupAt: 1 });
    const alreadyRunning = new Set(active.filter((s) => managedById.has(String(s._id))).map((s) => String(s._id)));
    const runningServers = active.filter((s) => alreadyRunning.has(String(s._id)));
    const runningManaged: ResourceEnvelope[] = runningServers.map((s) => {
      const p = profileByKey.get(s.profileKey);
      const envelope = getEffectiveEnvelope(p?.envelope, s.gameSlug, p?.sampleCount);
      return { cpuCores: envelope.cpuCores, ramBytes: envelope.ramBytes };
    });
    const plannedReservations = reservations.filter((r) => !r.communityServerId || !alreadyRunning.has(String(r.communityServerId)));

    // Budget downsizing guard: if running servers exceed the configured hosting budget,
    // cleanly scale down the lowest-priority empty, unprotected servers until within budget.
    let totalRunningCpu = runningManaged.reduce((sum, e) => sum + e.cpuCores, 0);
    let totalRunningRam = runningManaged.reduce((sum, e) => sum + e.ramBytes, 0);
    const previous = await CommunityServer.find({ regionKey: config.node.regionKey }).select({ profileKey: 1, cooldownUntil: 1, manualPause: 1, onlineSince: 1 }).lean();

    if (totalRunningCpu > config.budget.cpuCores || totalRunningRam > config.budget.ramBytes) {
      const candidatesToScaleDown = runningServers
        .filter((s) => (!s.protectedUntil || new Date(s.protectedUntil) <= now) && (s.playerCount === null || s.playerCount === 0))
        .sort((a, b) => {
          const profA = profileByKey.get(a.profileKey);
          const profB = profileByKey.get(b.profileKey);
          return rotationPriority(now, profA, previous) - rotationPriority(now, profB, previous);
        });

      for (const server of candidatesToScaleDown) {
        if (totalRunningCpu <= config.budget.cpuCores && totalRunningRam <= config.budget.ramBytes) break;
        const stopped = await stopManagedHostRoom(String(server._id));
        if (stopped.ok) {
          server.desiredState = "stopped";
          server.runtimeState = "stopped";
          server.decisionReason = "BUDGET_EXCEEDED";
          await server.save();
          await recordHostingAction("community_server_scaled_down", server, "Budget downsized");
          const p = profileByKey.get(server.profileKey);
          const env = getEffectiveEnvelope(p?.envelope, server.gameSlug, p?.sampleCount);
          totalRunningCpu -= env.cpuCores;
          totalRunningRam -= env.ramBytes;
          const idx = runningServers.findIndex((s) => String(s._id) === String(server._id));
          if (idx !== -1) {
            runningServers.splice(idx, 1);
            runningManaged.splice(idx, 1);
          }
          alreadyRunning.delete(String(server._id));
        }
      }
    }
    const verified = profiles.filter((p) => p.enabled);
    const due = reservations.find((r) => r.warmupAt <= now && (!r.communityServerId || !alreadyRunning.has(String(r.communityServerId))));
    const rotationCandidates = verified
      .sort((a, b) => rotationPriority(now, b, previous) - rotationPriority(now, a, previous) || a.key.localeCompare(b.key));
    const bound = due?.communityServerId ? active.find((s) => String(s._id) === String(due.communityServerId)) : null;
    if (due) {
      if (bound && !alreadyRunning.has(String(bound._id)) && (bound.recoveryAttempts >= 3 || (bound.nextRecoveryAt && new Date(bound.nextRecoveryAt) > now))) {
        await CapacityReservation.updateOne({ _id: due._id }, { $set: { decisionReason: "RUNTIME_RECOVERY_BACKOFF" } });
        if (bound.recoveryAttempts >= 3) {
          await recordHostingAction("community_server_recovery_exhausted", bound, `Recovery attempts exhausted (${bound.recoveryAttempts})`);
        }
        return { action: "waiting", reason: "RUNTIME_RECOVERY_BACKOFF" };
      }
      if (active.some((s) => s.profileKey === due.profileKey && s.linkedEventId && String(s.linkedEventId) !== String(due.eventId) && s.protectedUntil && new Date(s.protectedUntil) > now)) {
        await CapacityReservation.updateOne({ _id: due._id }, { $set: { decisionReason: "SERVER_PROTECTED_FOR_ANOTHER_EVENT" } });
        return { action: "waiting", reason: "SERVER_PROTECTED_FOR_ANOTHER_EVENT" };
      }
      const existingServer = active.find((s) => s.profileKey === due.profileKey && alreadyRunning.has(String(s._id)) &&
        (!s.linkedEventId || String(s.linkedEventId) === String(due.eventId) || !s.protectedUntil || new Date(s.protectedUntil) <= now));
      if (existingServer) {
        due.communityServerId = existingServer._id;
        due.state = "active";
        due.decisionReason = null;
        await due.save();
        existingServer.linkedEventId = due.eventId;
        existingServer.protectedUntil = due.protectedUntil;
        await existingServer.save();
        return { action: "reserved_existing" };
      }
      const dueProfile = verified.find((p) => p.key === due.profileKey);
      if (!dueProfile) {
        await CapacityReservation.updateOne({ _id: due._id }, { $set: { decisionReason: "PROFILE_NOT_VERIFIED" } });
        return { action: "waiting", reason: "PROFILE_NOT_VERIFIED" };
      }
      const envelope = getEffectiveEnvelope(dueProfile.envelope, dueProfile.gameSlug);
      const decision = placementDecision({
        now, nodeEnabled: config.node.enabled, draining: config.node.draining,
        requestedRegion: config.node.regionKey, nodeRegion: config.node.regionKey,
        profileVerified: true,
        metrics: nodePlacementMetrics(metrics),
        safety: config.safety, budget: config.budget,
        runningManaged, plannedReservations: plannedReservations.filter((r) => r.sourceKey !== due.sourceKey).map((r) => ({ cpuCores: r.cpuCores, ramBytes: r.ramBytes })),
        requested: { cpuCores: envelope.cpuCores, ramBytes: envelope.ramBytes },
      });
      if (!decision.allowed) {
        await CapacityReservation.updateOne({ _id: due._id }, { $set: { decisionReason: decision.reason } });
        await recordHostingAction("community_server_capacity_blocked", { gameSlug: dueProfile.gameSlug, editionSlug: dueProfile.editionSlug, profileKey: dueProfile.key }, decision.reason);
        return { action: "waiting", reason: decision.reason };
      }
      const slug = `pb-${dueProfile.key}-${config.node.regionKey}`;
      const server = await CommunityServer.findOneAndUpdate({ slug }, {
        $setOnInsert: {
          slug, gameSlug: dueProfile.gameSlug,
          editionSlug: dueProfile.editionSlug || null, mod: dueProfile.mod || null, regionKey: config.node.regionKey, profileKey: dueProfile.key,
        },
        $set: { name: "PlayBound.Club Community Server", desiredState: "running", runtimeState: "pending", decisionReason: "GAME_NIGHT_WARMUP", lastReconciledAt: now },
      }, { upsert: true, new: true });
      const id = String(server._id);
      due.communityServerId = server._id;
      due.state = "active";
      await due.save();
      server.linkedEventId = due.eventId;
      server.protectedUntil = due.protectedUntil;
      await server.save();
      if (bound && !alreadyRunning.has(String(bound._id))) {
        server.recoveryAttempts = (server.recoveryAttempts || 0) + 1;
        server.nextRecoveryAt = new Date(now.getTime() + Math.min(120, 15 * 2 ** (server.recoveryAttempts - 1)) * 60_000);
        await server.save();
      }
      const started = await requestManagedHostRoom({
        communityServerId: id,
        gameSlug: dueProfile.recipeSlug || dueProfile.gameSlug,
        editionSlug: dueProfile.editionSlug,
        mod: dueProfile.mod,
        name: server.name,
      });
      if (started.status === "failed") {
        server.runtimeState = "failed";
        server.decisionReason = started.error;
        await server.save();
        await recordHostingAction("community_server_failed", server, started.error);
        return { action: "failed", reason: started.error };
      }
      await recordHostingAction("community_server_start", server);
      return { action: "starting", reason: `game night warmup: ${dueProfile.key}` };
    }

    const candidateServers = rotationCandidates.filter((p) =>
      !active.some((s) => s.profileKey === p.key && (s.desiredState === "running" || alreadyRunning.has(String(s._id)))) &&
      !previous.some((s) => s.profileKey === p.key && s.manualPause) &&
      !previous.some((s) => s.profileKey === p.key && s.cooldownUntil && new Date(s.cooldownUntil) > now)
    );

    let startedCount = 0;
    const startedProfiles: string[] = [];
    let lastBlockedReason: string | undefined;

    for (const candidate of candidateServers) {
      const envelope = getEffectiveEnvelope(candidate.envelope, candidate.gameSlug, candidate.sampleCount);
      const decision = placementDecision({
        now, nodeEnabled: config.node.enabled, draining: config.node.draining,
        requestedRegion: config.node.regionKey, nodeRegion: config.node.regionKey,
        profileVerified: true,
        metrics: nodePlacementMetrics(metrics),
        safety: config.safety, budget: config.budget,
        runningManaged,
        plannedReservations: plannedReservations.map((r) => ({ cpuCores: r.cpuCores, ramBytes: r.ramBytes })),
        requested: { cpuCores: envelope.cpuCores, ramBytes: envelope.ramBytes },
      });
      if (!decision.allowed) {
        lastBlockedReason = decision.reason;
        continue;
      }
      const slug = `pb-${candidate.key}-${config.node.regionKey}`;
      const server = await CommunityServer.findOneAndUpdate({ slug }, {
        $setOnInsert: {
          slug, gameSlug: candidate.gameSlug,
          editionSlug: candidate.editionSlug || null, mod: candidate.mod || null, regionKey: config.node.regionKey, profileKey: candidate.key,
        },
        $set: { name: "PlayBound.Club Community Server", desiredState: "running", runtimeState: "pending", decisionReason: "ROTATION_START", lastReconciledAt: now },
      }, { upsert: true, new: true });
      const id = String(server._id);
      const started = await requestManagedHostRoom({
        communityServerId: id,
        gameSlug: candidate.recipeSlug || candidate.gameSlug,
        editionSlug: candidate.editionSlug,
        mod: candidate.mod,
        name: server.name,
      });
      if (started.status === "failed") {
        server.desiredState = "stopped";
        server.runtimeState = "stopped";
        server.decisionReason = started.error;
        await server.save();
        await recordHostingAction("community_server_failed", server, started.error);
        if (started.error?.includes("capacity")) {
          break;
        }
      } else {
        if (started.room) {
          server.runtimeState = "running";
          server.runtimeId = started.room.roomId;
          server.host = started.room.host;
          server.port = started.room.port;
          server.decisionReason = "RUNNING";
          await server.save();
        }
        await recordHostingAction("community_server_start", server);
        runningManaged.push({ cpuCores: envelope.cpuCores, ramBytes: envelope.ramBytes });
        startedCount++;
        startedProfiles.push(candidate.key);
      }
    }

    if (startedCount > 0) {
      return { action: "starting", reason: `started ${startedCount} servers (${startedProfiles.join(", ")})` };
    }

    // Recover a missing runtime under its stable CommunityServer ID. Never
    // retry indefinitely or bypass the same capacity gates as a new room.
    for (const server of lost) {
      const recoveryProfile = profileByKey.get(server.profileKey);
      if (!recoveryProfile?.enabled) continue;
      if (server.recoveryAttempts >= 3) {
        await recordHostingAction("community_server_recovery_exhausted", server, `Recovery attempts exhausted (${server.recoveryAttempts})`);
        continue;
      }
      if (server.manualPause || (server.nextRecoveryAt && new Date(server.nextRecoveryAt) > now)) continue;
      const recoveryEnvelope = getEffectiveEnvelope(recoveryProfile.envelope);
      const decision = placementDecision({
        now, nodeEnabled: config.node.enabled, draining: config.node.draining,
        requestedRegion: server.regionKey, nodeRegion: config.node.regionKey,
        profileVerified: true,
        metrics: nodePlacementMetrics(metrics),
        safety: config.safety, budget: config.budget, runningManaged,
        plannedReservations: plannedReservations.filter((r) => String(r.communityServerId || "") !== String(server._id)).map((r) => ({ cpuCores: r.cpuCores, ramBytes: r.ramBytes })),
        requested: { cpuCores: recoveryEnvelope.cpuCores, ramBytes: recoveryEnvelope.ramBytes },
      });
      if (!decision.allowed) {
        server.decisionReason = decision.reason;
        await server.save();
        continue;
      }
      server.recoveryAttempts += 1;
      server.nextRecoveryAt = new Date(now.getTime() + Math.min(120, 15 * 2 ** (server.recoveryAttempts - 1)) * 60_000);
      server.runtimeState = "pending";
      server.decisionReason = "RECOVERING_RUNTIME";
      await server.save();
      const result = await requestManagedHostRoom({
        communityServerId: String(server._id),
        gameSlug: recoveryProfile.recipeSlug || recoveryProfile.gameSlug,
        editionSlug: recoveryProfile.editionSlug,
        mod: recoveryProfile.mod,
        name: server.name,
      });
      if (result.status === "failed") {
        server.runtimeState = "failed";
        server.decisionReason = result.error;
        await server.save();
        await recordHostingAction("community_server_failed", server, result.error);
      } else {
        await recordHostingAction("community_server_recovery", server);
      }
      return { action: "recovering", reason: result.status === "failed" ? result.error : undefined };
    }

    // Rotation is conservative: only stop a confirmed-empty, unprotected
    // server when another verified candidate is waiting for its capacity.
    const waiting = rotationCandidates.find((p) =>
      !active.some((s) => s.profileKey === p.key) &&
      !previous.some((s) => s.profileKey === p.key && s.manualPause) &&
      !previous.some((s) => s.profileKey === p.key && s.cooldownUntil && new Date(s.cooldownUntil) > now)
    );
    if (waiting) {
      for (const server of active) {
        const profileForServer = profileByKey.get(server.profileKey);
        const minOnline = (profileForServer?.minimumOnlineMinutes ?? config.rotation.minimumOnlineMinutes) * 60_000;
        const idle = (profileForServer?.idleMinutes ?? config.rotation.idleMinutes) * 60_000;
        const lastActivity = server.lastOccupiedAt || server.onlineSince;
        if (server.playerCount !== 0 || !server.playerCountCheckedAt || now.getTime() - new Date(server.playerCountCheckedAt).getTime() > 2 * 60_000) continue;
        if (!server.onlineSince || now.getTime() - new Date(server.onlineSince).getTime() < minOnline || !lastActivity || now.getTime() - new Date(lastActivity).getTime() < idle) continue;
        if (server.protectedUntil && new Date(server.protectedUntil) > now) continue;
        const stopped = await stopManagedHostRoom(String(server._id));
        if (!stopped.ok) {
          await recordHostingAction("community_server_stop_failed", server, stopped.error);
          return { action: "failed", reason: stopped.error };
        }
        server.desiredState = "stopped";
        server.runtimeState = "stopped";
        server.health = "unknown";
        server.playerCount = null;
        server.cooldownUntil = new Date(now.getTime() + (profileForServer?.cooldownMinutes ?? config.rotation.cooldownMinutes) * 60_000);
        server.decisionReason = "ROTATED_EMPTY";
        await server.save();
        await recordHostingAction("community_server_rotated", server);
        return { action: "rotated" };
      }
    }
    if (candidateServers.length > 0 && lastBlockedReason) {
      return { action: "waiting", reason: lastBlockedReason };
    }
    return { action: "unchanged" };
  } finally {
    await CommunityHostingLease.updateOne({ key: "fleet", owner }, { $set: { leaseUntil: new Date(0) } });
  }
}
