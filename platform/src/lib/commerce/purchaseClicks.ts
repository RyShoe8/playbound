import TelemetryEvent from "@/lib/models/TelemetryEvent";

/** Recorded outbound clicks, not completed store orders. Caller connects to Mongo. */
export async function purchaseClicksByGame(slugs: string[]): Promise<Map<string, number> | null> {
  if (!slugs.length) return new Map();
  try {
    // One scoped query for the entire catalog, using the event/gameSlug index.
    const rows = await TelemetryEvent.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          event: "purchase_clicked",
          "properties.gameSlug": { $in: [...new Set(slugs)] },
          isBot: { $ne: true },
        },
      },
      { $group: { _id: "$properties.gameSlug", count: { $sum: 1 } } },
    ]).option({ maxTimeMS: 5_000 });
    return new Map(rows.map((row) => [row._id, row.count]));
  } catch (error) {
    console.warn("[ecommerce] Purchase-link click counts unavailable", error);
    // A failed query must never look like zero activity.
    return null;
  }
}
