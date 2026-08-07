import { Metadata } from "next";
import { FriendsView } from "@/components/friends/FriendsView";
import { PopoutButton } from "@/components/friends/PopoutButton";
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
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Friends</h1>
          <p className="mt-2 text-muted-foreground">
            See who&apos;s playing and manage friend requests.
          </p>
        </div>
        <PopoutButton />
      </div>
      <FriendsView
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
        genres={[...GENRES]}
      />
    </div>
  );
}
