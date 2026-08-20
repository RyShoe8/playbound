import { Metadata } from "next";
import { FriendsView } from "@/components/friends/FriendsView";
import { listGames } from "@/lib/catalog";
import { GENRES } from "@/lib/gamePayload";

export const metadata: Metadata = {
  title: "Friends",
  description: "See who's playing and manage friend requests.",
};

export default async function FriendsPage() {
  // Fetched here so the picker lists the real catalog rather than a hardcoded set.
  const games = await listGames();
  return (
    <div className="w-full space-y-4 px-4 py-8 sm:px-6 lg:px-8">
      <FriendsView
        games={games.map((g) => ({
          slug: g.slug,
          title: g.title,
          website: g.website,
          launchMethods: g.launchMethods,
          browserPlayable: g.browserPlayable,
          /*
           * Carried so the party picker can drop singleplayer games. Passed
           * rather than precomputed here because this same list also feeds
           * AddFriends, which wants the whole catalog.
           */
          features: g.features,
        }))}
        genres={[...GENRES]}
      />
    </div>
  );
}
