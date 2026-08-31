import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getServerSession } from "next-auth/next";
import { Server } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { GlobalServerBrowser } from "@/components/GlobalServerBrowser";
import { pageMetadata } from "@/lib/seo";
import { listDiscoverableGames } from "@/lib/access/discover";

export const metadata: Metadata = pageMetadata({
  title: "Live Free Game Servers — Player Counts Right Now",
  description:
    "Live public multiplayer servers across every free game on PlayBound, with current player counts, maps and locations. Free to join, no account needed.",
  path: "/servers",
});

export default async function ServersPage() {
  // Per-request by nature: live data, the signed-in viewer, or both.
  // Reads the database before it reads anything request-scoped, which
  // Cache Components will not allow during a prerender.
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
      console.error("Servers page library load failed:", err);
    }
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <div className="flex items-center gap-2">
          <Server className="size-6 text-primary" />
          <h1 className="text-3xl font-extrabold tracking-tight">Servers</h1>
        </div>
      </div>

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading servers…</p>}>
        <GlobalServerBrowser
          installedGameSlugs={installedGameSlugs}
          installedModSlugs={installedModSlugs}
          signedIn={Boolean(session?.user)}
          allowedSlugs={allowedSlugs}
        />
      </Suspense>
    </div>
  );
}
