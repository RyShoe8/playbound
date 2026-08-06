import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listAllGames } from "@/lib/catalog";
import { editionCountsByGame } from "@/lib/editions";
import { ProvisionDiscordAllButton } from "@/components/admin/ProvisionDiscordAllButton";
import { AdminGamesTable } from "@/components/admin/AdminGamesTable";

export const metadata: Metadata = { title: "Admin · Games" };

export default async function AdminGamesPage() {
  const [games, editionCounts] = await Promise.all([listAllGames(), editionCountsByGame()]);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Games</h1>
          <p className="mt-1 text-muted-foreground">Create, edit, and publish catalog entries in MongoDB.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProvisionDiscordAllButton />
          <Link
            href="/admin/games/new"
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
          >
            <Plus className="size-4" /> New game
          </Link>
        </div>
      </div>

      {/* Rows and search live in a client component so filtering is instant.
          A Map cannot cross the server/client boundary, so counts are passed
          as a plain object. */}
      <AdminGamesTable games={games} editionCounts={Object.fromEntries(editionCounts)} />
    </div>
  );
}
