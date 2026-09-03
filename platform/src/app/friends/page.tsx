import { Metadata } from "next";
import { FriendsView } from "@/components/friends/FriendsView";
import { listGames } from "@/lib/catalog";
import { viewerCanSeeTesting } from "@/lib/requestIncludesTesting";
import { GENRES } from "@/lib/gamePayload";
import { privateMetadata } from "@/lib/seo";

/*
 * Not indexed. Everything here is scoped to the signed-out visitor's empty
 * session, so a crawler sees a friends list with no friends — a thin page that
 * competes for nothing and dilutes the quality signal across the site.
 */
export const metadata: Metadata = privateMetadata("Friends");

export default async function FriendsPage() {
  /*
   * Fetched here so the picker lists the real catalog rather than a hardcoded
   * set — and with testing entries for the people allowed to see them.
   *
   * Without that the two party pickers disagreed on which games exist, not
   * just which are multiplayer: the launcher hands testers the testing catalog,
   * so OpenClonk, OpenTyrian 2000, OpenHV, OpenSpades, Populous: Reincarnated,
   * Re-Volt and Pokémon: Dawn of Darkness were all offered there and missing
   * here. Every one of them is `status: testing`.
   *
   * This page is already dynamic — it reads the session and queries Mongo per
   * request — so resolving the viewer costs nothing extra, and it is private
   * and unindexed, so no cached copy can leak a testing entry to the public.
   */
  const games = await listGames({ includeTesting: await viewerCanSeeTesting() });
  return (
    <div className="w-full space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <FriendsView
        games={games.map((g) => ({
          slug: g.slug,
          title: g.title,
          website: g.website,
          launchMethods: g.launchMethods,
          browserPlayable: g.browserPlayable,
          platforms: g.platforms,
          steamDeck: g.steamDeck,
          launcherInstall: g.launcherInstall,
          /*
           * Carried so the party picker can drop singleplayer games. Passed
           * rather than precomputed here because this same list also feeds
           * AddFriends, which wants the whole catalog.
           *
           * Both fields matter: supportsMultiplayer reads tags as well as
           * features (hotseat/LAN/split-screen never appear in features), and
           * dropping tags here was why the web party picker offered fewer
           * games than the launcher's, which gets both from the same catalog.
           */
          features: g.features,
          tags: g.tags,
        }))}
        genres={[...GENRES]}
      />
    </div>
  );
}
