import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { MultiplayerHome } from "@/components/MultiplayerHome";
import { pageMetadata } from "@/lib/seo";
import { listDiscoverableGames } from "@/lib/access/discover";

export const metadata: Metadata = pageMetadata({
  title: "Multiplayer — Open Parties, Live Servers & Looking to Play · PlayBound",
  description:
    "Join open parties, discover live community game servers, and find players across every free and affordable multiplayer title on PlayBound.",
  path: "/multiplayer",
});

export default async function MultiplayerPage() {
  await connection();
  const session = await getServerSession(authOptions);
  let installedGameSlugs: string[] = [];
  let installedModSlugs: string[] = [];
  const discoverable = await listDiscoverableGames();
  const allowedSlugs = discoverable.map((g) => g.slug);

  if (session?.user) {
    try {
      await dbConnect();
      const [games, mods] = await Promise.all([
        LibraryEntry.find({ userId: session.user.id, installed: true }).select("gameSlug").lean(),
        LibraryModEntry.find({ userId: session.user.id, installed: true }).select("modSlug").lean(),
      ]);
      installedGameSlugs = games.map((g) => String(g.gameSlug));
      installedModSlugs = mods.map((m) => String(m.modSlug));
    } catch (err) {
      console.error("Multiplayer page library load failed:", err);
    }
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-[400px] items-center justify-center p-8 text-sm text-muted-foreground">
          Loading multiplayer hub…
        </div>
      }
    >
      <MultiplayerHome
        installedGameSlugs={installedGameSlugs}
        installedModSlugs={installedModSlugs}
        signedIn={Boolean(session?.user)}
        allowedSlugs={allowedSlugs}
      />
    </Suspense>
  );
}
