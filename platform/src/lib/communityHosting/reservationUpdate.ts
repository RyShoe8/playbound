type ExistingReservation = { profileKey: string; state: string } | null;

/** MongoDB rejects an upsert when the same field appears in both operators. */
export function reservationUpsertUpdate(
  existing: ExistingReservation,
  profileKey: string,
  eventId: unknown,
  sourceKey: string,
  fields: Record<string, unknown>,
) {
  const reset = !existing || existing.profileKey !== profileKey || existing.state === "released";
  return {
    $set: {
      ...fields,
      ...(reset ? { communityServerId: null, state: "planned", decisionReason: null } : {}),
    },
    $setOnInsert: { eventId, sourceKey },
  };
}
