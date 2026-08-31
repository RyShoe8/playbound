import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listAllGames } from "@/lib/catalog";
import { editionCountsByGame, editionControllerSupportByGame } from "@/lib/editions";
import { modCountsByGame } from "@/lib/mods";
import { ProvisionDiscordAllButton } from "@/components/admin/ProvisionDiscordAllButton";
import { AdminGamesTable } from "@/components/admin/AdminGamesTable";
import { getGameHealth, HEALTH_WINDOW_DAYS } from "@/lib/admin/gameOpsHealth";

export const metadata: Metadata = { title: "Admin · Games" };

export default async function AdminGamesPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const [games, editionCounts, modCounts, health, editionControllerSupport] = await Promise.all([
    listAllGames(),
    editionCountsByGame(),
    modCountsByGame(),
    getGameHealth(),
    editionControllerSupportByGame(),
  ]);

  // Attached per row rather than passed as a second map: a Map cannot cross
  // the server/client boundary, and the table already carries the game.
  const rows = games.map((g) => ({ ...g, health: health.get(g.slug) }));

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
      <AdminGamesTable
        games={rows}
        editionCounts={Object.fromEntries(editionCounts)}
        modCounts={Object.fromEntries(modCounts)}
        editionControllerSupport={editionControllerSupport}
        healthWindowDays={HEALTH_WINDOW_DAYS}
      />
    </div>
  );
}
