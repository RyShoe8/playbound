import type { MongoClient } from "mongodb";

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
    const waited = (event as { durationMS?: number }).durationMS ?? 0;
    if (waited >= SLOW_CHECKOUT_MS) {
      console.warn(`[db:slow-checkout] waited ${Math.round(waited)}ms (pool max ${maxPoolSize})`);
    }
  });
  client.on("connectionCheckOutFailed", (event) => {
    const waited = (event as { durationMS?: number }).durationMS ?? 0;
    console.warn(`[db:checkout-failed] ${event.reason} after ${Math.round(waited)}ms (pool max ${maxPoolSize})`);
  });
}
