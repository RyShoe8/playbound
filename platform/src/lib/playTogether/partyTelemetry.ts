import { saveEvent } from "@/lib/telemetry/server/saveEvent";

export type PartyTelemetryProps = {
  partyId?: string;
  gameSlug?: string | null;
  userId?: string | null;
  /**
   * The party leader's OS, when the party recorded one. These events are
   * raised on the server, so there is no User-Agent to derive it from — see
   * the note below.
   */
  platform?: string | null;
  [key: string]: unknown;
};

/**
 * Fire-and-forget party ops events. Never throws into the mutation path.
 *
 * `origin: "server"` is stamped on every one of them because that is exactly
 * what they are: provisioning work the server does on a party's behalf, with
 * no request and no User-Agent behind it. Without it `saveEvent` recorded
 * `os: "unknown"` and the Ops platform breakdown showed every party operation
 * as Unknown — which reads as "we failed to detect this user's platform" and
 * led to the conclusion that macOS and Linux were being lost. They were not;
 * party events simply never carried a platform at all.
 *
 * `platform` carries the leader's OS when the party has one, so a party
 * failure is attributable to a real platform rather than to the server. The
 * origin stamp is what the card falls back to when it is absent.
 */
export function trackPartyEvent(event: string, props: PartyTelemetryProps): void {
  const { userId, platform, ...rest } = props;
  void saveEvent({
    event,
    properties: {
      ...rest,
      partyId: rest.partyId || undefined,
      gameSlug: rest.gameSlug || undefined,
      platform: platform || undefined,
      origin: "server",
    },
    userId: userId ?? null,
  }).catch((err) => {
    console.warn("trackPartyEvent failed", event, err);
  });
}

/**
 * The identifying props every party event carries, taken from the party.
 *
 * Exists so the leader's OS reaches telemetry from one place. It was
 * previously `partyId` and `gameSlug` written out at each of eighteen call
 * sites, and adding a third field to all of them by hand is exactly how one
 * gets missed — which for this field would be invisible, since the event still
 * saves and simply lands in the wrong bucket.
 *
 * `gameSlug` is still overridable: the host and LAN modules resolve the slug
 * themselves and pass the resolved one.
 */
export function partyEventProps(party: {
  _id: { toString(): string };
  gameSlug?: string | null;
  leaderOs?: string | null;
}): { partyId: string; gameSlug: string | null; platform: string | null } {
  return {
    partyId: String(party._id),
    gameSlug: party.gameSlug ?? null,
    platform: party.leaderOs ?? null,
  };
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
