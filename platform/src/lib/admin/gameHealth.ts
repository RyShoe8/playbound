import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";

export const GAME_HEALTH_STATUSES = ["green", "yellow", "red"] as const;
export type GameHealthStatus = (typeof GAME_HEALTH_STATUSES)[number];
export const GAME_HEALTH_AREAS = ["install", "party"] as const;
export type GameHealthArea = (typeof GAME_HEALTH_AREAS)[number];

export type GameOpsHealth = {
  install: GameHealthStatus;
  party: GameHealthStatus;
};

export function normalizeOpsHealth(raw: unknown): GameOpsHealth {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    install: GAME_HEALTH_STATUSES.includes(obj.install as GameHealthStatus)
      ? (obj.install as GameHealthStatus)
      : "green",
    party: GAME_HEALTH_STATUSES.includes(obj.party as GameHealthStatus)
      ? (obj.party as GameHealthStatus)
      : "green",
  };
}

/**
 * Flip a light to yellow when a new report arrives.
 * Never overwrites red. Never sets green.
 */
export async function markGameHealthYellow(
  slug: string | null | undefined,
  area: GameHealthArea
): Promise<void> {
  const gameSlug = String(slug || "").trim();
  if (!gameSlug) return;
  try {
    await dbConnect();
    const field = `opsHealth.${area}` as const;
    await CatalogGame.updateOne(
      {
        slug: gameSlug,
        $or: [{ [field]: { $exists: false } }, { [field]: "green" }, { [field]: null }],
      },
      { $set: { [field]: "yellow" } }
    );
  } catch (err) {
    console.warn("markGameHealthYellow failed", gameSlug, area, err);
  }
}

export function healthAreaForBug(input: {
  event?: string | null;
  phase?: string | null;
  title?: string | null;
  description?: string | null;
}): GameHealthArea {
  const blob = `${input.event || ""} ${input.phase || ""} ${input.title || ""} ${input.description || ""}`.toLowerCase();
  if (
    input.event === "party_hosted_failed" ||
    input.event === "party_chat_failed" ||
    input.phase === "join" ||
    /\bparty\b/.test(blob) ||
    /\bjoin\b/.test(blob)
  ) {
    return "party";
  }
  return "install";
}
