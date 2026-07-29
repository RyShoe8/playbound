import type { Metadata } from "next";
import { getServerSession } from "next-auth/next";
import { Server } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryEntry from "@/lib/models/LibraryEntry";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { GlobalServerBrowser } from "@/components/GlobalServerBrowser";

export const metadata: Metadata = { title: "Servers" };

export default async function ServersPage() {
  const session = await getServerSession(authOptions);
  let installedGameSlugs: string[] = [];
  let installedModSlugs: string[] = [];

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
        <p className="mt-1 text-muted-foreground">
          Browse live multiplayer servers across PlayBound titles. Est. latency is GeoIP-based — the
          desktop app shows a real host ping.
        </p>
      </div>

      <GlobalServerBrowser
        installedGameSlugs={installedGameSlugs}
        installedModSlugs={installedModSlugs}
        signedIn={Boolean(session?.user)}
      />
    </div>
  );
}
