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
export function trackPartyFailure(
  area: PartyFailureArea,
  props: PartyTelemetryProps & { op: string; message?: unknown; status?: number }
): void {
  const { message, ...rest } = props;
  const text =
    message instanceof Error ? message.message : message == null ? undefined : String(message);
  trackPartyEvent("party_failed", {
    ...rest,
    area,
    // Truncated: a stack or an HTML error body would bloat every row.
    message: text ? text.slice(0, 300) : undefined,
  });
  console.warn(`[party:${area}] ${props.op} failed`, text ?? "");
}

/** The counterpart, so a rate has a denominator. */
export function trackPartyOk(
  area: PartyFailureArea,
  props: PartyTelemetryProps & { op: string }
): void {
  trackPartyEvent("party_ok", { ...props, area });
}
