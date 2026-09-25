import { unstable_cache } from "next/cache";
import dbConnect from "@/lib/db";
import ControlProfile from "@/lib/models/ControlProfile";
import CatalogGame from "@/lib/models/CatalogGame";

/**
 * Read layer for `ControlProfile` — mirrors the `unstable_cache`/tag pattern
 * used by `storeDiscounts/service.ts` and `freeOffers/service.ts`, busted by
 * the admin route on write via `revalidateTag("control-profiles")`.
 */

/**
 * "partial" (native support that's known to be broken/incomplete) has no
 * machine-derivable signal here — it would need an editorial override on the
 * game/edition record, which is out of scope for V1. `classifyControlSupport`
 * below never returns it; it's included in the type so a future manual
 * override can slot in without widening this union again.
 */
export type ControlSupportLevel =
  | "native"
  | "playbound_enhanced"
  | "playbound_profile_available"
  | "partial"
  | "unsupported";

/**
 * The one `verified` profile for a game (optionally scoped to an edition),
 * or null if none exists yet — the launcher and the public controller-support
 * label both key off this, never a "draft"/"testing" row.
 */
async function queryVerifiedProfile(gameSlug: string, editionSlug: string | null): Promise<Record<string, unknown> | null> {
  try {
    await dbConnect();
    const doc = await ControlProfile.findOne({
      gameSlug,
      editionSlug: editionSlug ?? null,
      status: "verified",
    }).lean();
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  } catch (err) {
    console.error("[controlProfiles] queryVerifiedProfile failed:", err);
    return null;
  }
}

export async function getVerifiedProfile(gameSlug: string, editionSlug: string | null = null): Promise<Record<string, unknown> | null> {
  const exact = await unstable_cache(
    () => queryVerifiedProfile(gameSlug, editionSlug),
    ["control-profiles", "verified", gameSlug, editionSlug ?? "__base__"],
    { revalidate: 300, tags: ["control-profiles"] }
  )();
  return exact || (editionSlug ? getVerifiedProfile(gameSlug, null) : null);
}

async function queryTestingProfile(gameSlug: string, editionSlug: string | null): Promise<Record<string, unknown> | null> {
  try {
    await dbConnect();
    const doc = await ControlProfile.findOne({ gameSlug, editionSlug: editionSlug ?? null, status: "testing" }).lean();
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  } catch (err) {
    console.error("[controlProfiles] queryTestingProfile failed:", err);
    return null;
  }
}

export async function getTestingProfile(gameSlug: string, editionSlug: string | null = null): Promise<Record<string, unknown> | null> {
  const exact = await unstable_cache(
    () => queryTestingProfile(gameSlug, editionSlug),
    ["control-profiles", "testing", gameSlug, editionSlug ?? "__base__"],
    { revalidate: 300, tags: ["control-profiles"] }
  )();
  return exact || (editionSlug ? getTestingProfile(gameSlug, null) : null);
}

/**
 * Public controller-support classification for a game/edition — see the
 * feature's plan on why this replaces a blanket "Controller Supported"
 * badge. `hasNativeSupport` comes from the caller (the existing
 * `CatalogGame.controls` "controller" scheme's `supported` flag), since this
 * service only knows about PlayBound-authored profiles, not native support.
 */
export async function classifyControlSupport(
  gameSlug: string,
  editionSlug: string | null,
  hasNativeSupport: boolean
): Promise<ControlSupportLevel> {
  if (hasNativeSupport) return "native";

  const verified = await getVerifiedProfile(gameSlug, editionSlug);
  if (verified) return "playbound_enhanced";

  try {
    await dbConnect();
    const anyProfile = await ControlProfile.exists({ gameSlug, editionSlug: editionSlug ?? null });
    if (anyProfile) return "playbound_profile_available";
  } catch (err) {
    console.error("[controlProfiles] classifyControlSupport failed:", err);
  }
  return "unsupported";
}

export type PublicControlProfile = {
  gameSlug: string;
  title: string;
  status: "verified" | "testing";
};

/** Only published games appear on the marketing page; no private draft rows. */
async function queryPublicProfiles(): Promise<PublicControlProfile[]> {
  try {
    await dbConnect();
    const profiles = await ControlProfile.find({ status: { $in: ["verified", "testing"] } })
      .select("gameSlug status")
      .lean();
    const slugs = [...new Set(profiles.map((profile) => profile.gameSlug))];
    if (!slugs.length) return [];
    const games = await CatalogGame.find({ slug: { $in: slugs }, status: "published", published: { $ne: false } })
      .select("slug title")
      .lean();
    const titles = new Map(games.map((game) => [game.slug, game.title]));
    const bySlug = new Map<string, PublicControlProfile>();
    for (const profile of profiles) {
      const title = titles.get(profile.gameSlug);
      if (!title) continue;
      const current = bySlug.get(profile.gameSlug);
      if (!current || profile.status === "verified") {
        bySlug.set(profile.gameSlug, { gameSlug: profile.gameSlug, title, status: profile.status as "verified" | "testing" });
      }
    }
    return [...bySlug.values()].sort((a, b) => a.title.localeCompare(b.title));
  } catch (err) {
    console.error("[controlProfiles] queryPublicProfiles failed:", err);
    return [];
  }
}

export const listPublicControlProfiles = unstable_cache(queryPublicProfiles, ["control-profiles", "public-list"], {
  revalidate: 300,
  tags: ["control-profiles"],
});
