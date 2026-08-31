import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listAllMods } from "@/lib/mods";
import { listAllGames } from "@/lib/catalog";
import { getModClassificationTree, getModClassificationsWithAncestry } from "@/lib/modClassifications";
import { AdminModsTable } from "@/components/admin/AdminModsTable";

export const metadata: Metadata = {
  title: "Admin · All Mods",
};

export default async function AdminAllModsPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const [mods, games] = await Promise.all([
    listAllMods(),
    listAllGames(),
  ]);

  const gameTitlesBySlug: Record<string, string> = {};
  for (const g of games) {
    gameTitlesBySlug[g.slug] = g.title;
  }

  // Preload all classification tags
  const { flat } = await getModClassificationTree(true);
  const byId = new Map(flat.map((f) => [f.id, f]));

  const modsWithClassifications = mods.map((m) => {
    const classifications = (m.classificationIds || [])
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((c) => ({
        id: c!.id,
        name: c!.name,
        path: c!.path,
        leaf: c!.name,
      }));

    return {
      ...m,
      classifications,
    };
  });

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Mods</h1>
          <p className="mt-1 text-muted-foreground">
            Manage, classify, and publish packageable add-ons across all PlayBound games.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/games/mod-classifications"
            className="flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold hover:bg-secondary/80 transition-colors"
          >
            Mod Classifications
          </Link>
          <Link
            href="/admin/mods/new"
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
          >
            <Plus className="size-4" /> New mod
          </Link>
        </div>
      </div>

      <AdminModsTable mods={modsWithClassifications} gameTitlesBySlug={gameTitlesBySlug} />
    </div>
  );
}
