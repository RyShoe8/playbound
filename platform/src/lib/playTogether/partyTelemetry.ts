import { saveEvent } from "@/lib/telemetry/server/saveEvent";

export type PartyTelemetryProps = {
  partyId?: string;
  gameSlug?: string | null;
  userId?: string | null;
  [key: string]: unknown;
};

/** Fire-and-forget party ops events. Never throws into the mutation path. */
export function trackPartyEvent(event: string, props: PartyTelemetryProps): void {
  const { userId, ...rest } = props;
  void saveEvent({
    event,
    properties: {
      ...rest,
      partyId: rest.partyId || undefined,
      gameSlug: rest.gameSlug || undefined,
    },
    userId: userId ?? null,
  }).catch((err) => {
    console.warn("trackPartyEvent failed", event, err);
  });
}

/**
 * Which part of the party system broke.
 *
 * Kept to a closed set so Ops can group by it. Every one of these used to
 * `console.warn` and return false, which meant a party that silently failed to
 * get a voice channel, an overlay, or a config-sync left no trace anywhere a
 * human would look — the party just quietly did less than it should have.
 */
export type PartyFailureArea =
  | "discord"
  | "sync"
  | "host"
  | "lan"
  | "chat"
  | "launch"
  | "membership";

/**
 * One event for every party failure, so the rate is countable.
 *
 * Emitted alongside the area-specific events that already exist rather than
 * replacing them: `party_hosted_failed` still fires and still carries its own
 * detail, this just makes "how much of the party system is failing" a single
 * query instead of a growing list of event names to remember.
 */
/**
 * A database failure must never be reported *to the database*.
 *
 * Recording a failure costs a write. When the failure being recorded is the
 * database itself, that write is more load on the thing that is already
 * struggling — and the party panel polls every 1.5s, so it repeats. This is a
 * feedback loop that turns a slow cluster into a hammered one, and it is the
 * reason these events must be filtered rather than merely rate-limited.
 */
function isInfrastructureFailure(text: string | undefined): boolean {
  if (!text) return false;
  return /Mongo|mongoose|tlsv1 alert|ECONNRESET|ETIMEDOUT|ServerSelection|topology|pool|Catalog read failed/i.test(
    text
  );
}

/**
 * Identical failures collapse for a while.
 *
 * A polling client retrying the same broken thing produces the same event
 * several times a second. One row per problem per minute says everything the
 * hundredth says, at a fraction of the cost.
 */
const FAILURE_DEDUPE_MS = 60_000;
const recentFailures = new Map<string, number>();

function shouldRecordFailure(key: string, now: number): boolean {
  const last = recentFailures.get(key);
  if (last && now - last < FAILURE_DEDUPE_MS) return false;
  recentFailures.set(key, now);
  // Bounded: this lives for the lifetime of a warm lambda.
  if (recentFailures.size > 200) {
    for (const [k, t] of recentFailures) {
      if (now - t >= FAILURE_DEDUPE_MS) recentFailures.delete(k);
    }
  }
  return true;
}

export function trackPartyFailure(
  area: PartyFailureArea,
  props: PartyTelemetryProps & { op: string; message?: unknown; status?: number }
): void {
  const { message, ...rest } = props;
  const text =
    message instanceof Error ? message.message : message == null ? undefined : String(message);

  // Always free, always happens — the log line never costs a query.
  console.warn(`[party:${area}] ${props.op} failed`, text ?? "");

  if (isInfrastructureFailure(text)) return;
  if (!shouldRecordFailure(`${area}:${props.op}:${rest.gameSlug ?? ""}`, Date.now())) return;

  trackPartyEvent("party_failed", {
    ...rest,
    area,
    // Truncated: a stack or an HTML error body would bloat every row.
    message: text ? text.slice(0, 300) : undefined,
  });
}

/** The counterpart, so a rate has a denominator. */
export function trackPartyOk(
  area: PartyFailureArea,
  props: PartyTelemetryProps & { op: string }
): void {
  trackPartyEvent("party_ok", { ...props, area });
}
