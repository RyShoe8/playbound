import type { MongoClient } from "mongodb";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Session } from "node:inspector";

/**
 * Slow-query and slow-checkout logging for the shared Mongo connection.
 *
 * Production logs showed MongoWaitQueueTimeoutError ("Timed out while
 * checking out a connection from connection pool") without saying what held
 * the connections. These two logs answer that:
 *
 *   [db:slow-query] cataloggames.find 2310ms filter=slug,status
 *   [db:slow-checkout] waited 1840ms (pool max 10)
 *
 * Only operations past the thresholds are logged, and only collection names,
 * command names and filter *field names* — never values, so nothing a user
 * typed or any credential can reach the logs.
 */

export const SLOW_QUERY_MS = 1_500;
export const SLOW_CHECKOUT_MS = 1_000;
/** Event-loop stalls longer than this are logged, at most once per window. */
export const EVENT_LOOP_LAG_MS = 1_000;
const EVENT_LOOP_WINDOW_MS = 30_000;

/*
 * A command's duration runs from send to reply *processing*, so a blocked
 * event loop inflates it: two unrelated queries "taking" 11 s and finishing in
 * the same millisecond is a stall, not slow Mongo. inUse at a slow checkout
 * separates the two: a wait with the pool not full means the loop was busy.
 */
let eventLoopMonitorStarted = false;
export function startEventLoopLagLog(): void {
  if (eventLoopMonitorStarted) return;
  eventLoopMonitorStarted = true;
  const histogram = monitorEventLoopDelay({ resolution: 50 });
  histogram.enable();
  /*
   * A Vercel instance is frozen between invocations, and the histogram counts
   * the freeze as one long "delay": a 314 s stall that exactly matched a 314 s
   * telemetry query was the instance asleep mid-query, not the loop busy. A
   * busy loop burns CPU for the whole stall; a frozen one burns almost none.
   */
  let cpuBefore = process.cpuUsage();
  const timer = setInterval(() => {
    const maxMs = histogram.max / 1e6;
    const cpu = process.cpuUsage(cpuBefore);
    cpuBefore = process.cpuUsage();
    const cpuMs = (cpu.user + cpu.system) / 1000;
    if (maxMs >= EVENT_LOOP_LAG_MS && cpuMs >= maxMs / 2) {
      console.warn(`[event-loop] stalled up to ${Math.round(maxMs)}ms (p99 ${Math.round(histogram.percentile(99) / 1e6)}ms, cpu ${Math.round(cpuMs)}ms) in the last ${EVENT_LOOP_WINDOW_MS / 1000}s`);
      profileHotFunctions();
    }
    histogram.reset();
  }, EVENT_LOOP_WINDOW_MS);
  timer.unref?.();
}

/*
 * Real stalls (CPU-backed, after the freeze filter above) recur on unrelated
 * pages, and the log alone cannot say what code burns the CPU. After one, the
 * instance samples itself for a while and logs the functions with the most
 * self time — names and file:line only, never arguments or data. At most once
 * per instance per PROFILE_COOLDOWN_MS so the sampler cannot become the load.
 */
const PROFILE_DURATION_MS = 20_000;
const PROFILE_COOLDOWN_MS = 15 * 60_000;
let lastProfileAt = 0;

type ProfileNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number };

function profileHotFunctions(): void {
  const now = Date.now();
  if (now - lastProfileAt < PROFILE_COOLDOWN_MS) return;
  lastProfileAt = now;
  let session: Session;
  try {
    session = new Session();
    session.connect();
  } catch {
    return;
  }
  const done = () => { try { session.disconnect(); } catch { /* already closed */ } };
  session.post("Profiler.enable", () => {
    session.post("Profiler.setSamplingInterval", { interval: 1000 }, () => {
      session.post("Profiler.start", () => {
        const timer = setTimeout(() => {
          session.post("Profiler.stop", (err, result) => {
            done();
            if (err || !result?.profile) return;
            const nodes = result.profile.nodes as ProfileNode[];
            const intervalMs = (result.profile.endTime - result.profile.startTime) / 1000 / Math.max(1, result.profile.samples?.length ?? 1);
            const byFrame = new Map<string, number>();
            for (const n of nodes) {
              const hits = n.hitCount ?? 0;
              const { functionName, url, lineNumber } = n.callFrame;
              if (!hits || functionName === "(idle)" || functionName === "(program)") continue;
              const file = url.replace(/^.*\/(\.next|node_modules)\//, "$1/");
              const key = `${functionName || "(anonymous)"} ${file}:${lineNumber + 1}`;
              byFrame.set(key, (byFrame.get(key) ?? 0) + hits);
            }
            const top = [...byFrame.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
              .map(([k, h]) => `${Math.round(h * intervalMs)}ms ${k}`);
            console.warn(`[event-loop:profile] top self time over ${PROFILE_DURATION_MS / 1000}s: ${top.join(" | ")}`);
          });
        }, PROFILE_DURATION_MS);
        timer.unref?.();
      });
    });
  });
}

/** Commands whose duration says nothing about query cost. */
const IGNORED_COMMANDS = new Set(["hello", "ismaster", "isMaster", "ping", "saslStart", "saslContinue", "endSessions", "getMore", "killCursors"]);

type Started = { label: string; filterKeys: string };

/** Collection + filter field names for a command, or null to skip it. */
export function describeCommand(commandName: string, command: Record<string, unknown>): Started | null {
  if (IGNORED_COMMANDS.has(commandName)) return null;
  const collection = typeof command[commandName] === "string" ? (command[commandName] as string) : "";
  const filter =
    (command.filter as Record<string, unknown> | undefined) ??
    (command.query as Record<string, unknown> | undefined) ??
    ((command.updates as Array<{ q?: Record<string, unknown> }> | undefined)?.[0]?.q) ??
    ((command.deletes as Array<{ q?: Record<string, unknown> }> | undefined)?.[0]?.q) ??
    ((command.pipeline as Array<Record<string, unknown>> | undefined)?.find((stage) => "$match" in stage)?.$match as
      | Record<string, unknown>
      | undefined);
  const filterKeys = filter && typeof filter === "object" ? Object.keys(filter).slice(0, 8).join(",") : "";
  return { label: collection ? `${collection}.${commandName}` : commandName, filterKeys };
}

const attached = new WeakSet<object>();

/** Attach once per MongoClient. Needs the client created with monitorCommands: true. */
export function attachDbDiagnostics(client: MongoClient, maxPoolSize: number): void {
  if (attached.has(client)) return;
  attached.add(client);

  // requestId -> description; bounded so a lost "succeeded" event cannot leak.
  const inFlight = new Map<number, Started>();
  // Connections currently checked out of this client's pool.
  let inUse = 0;
  startEventLoopLagLog();

  client.on("commandStarted", (event) => {
    const described = describeCommand(event.commandName, event.command as Record<string, unknown>);
    if (!described) return;
    if (inFlight.size > 500) inFlight.clear();
    inFlight.set(event.requestId, described);
  });

  const finish = (event: { requestId: number; duration: number }, failed: boolean) => {
    const described = inFlight.get(event.requestId);
    inFlight.delete(event.requestId);
    if (!described || event.duration < SLOW_QUERY_MS) return;
    console.warn(
      `[db:slow-query] ${described.label} ${Math.round(event.duration)}ms${described.filterKeys ? ` filter=${described.filterKeys}` : ""}${failed ? " FAILED" : ""}`
    );
  };
  client.on("commandSucceeded", (event) => finish(event, false));
  client.on("commandFailed", (event) => finish(event, true));

  client.on("connectionCheckedOut", (event) => {
    inUse += 1;
    const waited = (event as { durationMS?: number }).durationMS ?? 0;
    if (waited >= SLOW_CHECKOUT_MS) {
      console.warn(`[db:slow-checkout] waited ${Math.round(waited)}ms (inUse ${inUse}/${maxPoolSize})`);
    }
  });
  client.on("connectionCheckedIn", () => { inUse = Math.max(0, inUse - 1); });
  client.on("connectionCheckOutFailed", (event) => {
    const waited = (event as { durationMS?: number }).durationMS ?? 0;
    console.warn(`[db:checkout-failed] ${event.reason} after ${Math.round(waited)}ms (inUse ${inUse}/${maxPoolSize})`);
  });
}
