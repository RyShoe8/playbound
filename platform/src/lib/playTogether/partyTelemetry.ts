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
