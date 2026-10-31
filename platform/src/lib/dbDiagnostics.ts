import type { MongoClient } from "mongodb";
import { monitorEventLoopDelay } from "node:perf_hooks";

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
    }
    histogram.reset();
  }, EVENT_LOOP_WINDOW_MS);
  timer.unref?.();
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
