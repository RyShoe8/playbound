import Link from "next/link";
import type { Metadata } from "next";
import { listAllGames } from "@/lib/catalog";
import { listDevelopers } from "@/lib/developers";
import { emptyModDraft } from "@/lib/modPayload";
import { ModEditorForm } from "@/components/admin/ModEditorForm";

export const metadata: Metadata = {
  title: "Admin · New Mod",
};

export default async function AdminNewModPage() {
  const games = await listAllGames();
  const developers = await listDevelopers();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link
          href="/admin/games/mods"
          className="text-sm font-semibold text-muted-foreground hover:underline"
        >
          ← All Mods
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">New Mod</h1>
        <p className="mt-1 text-muted-foreground">
          Create a packageable add-on or community mod for any PlayBound game.
        </p>
      </div>
      <ModEditorForm
        mode="create"
        initial={emptyModDraft("")}
        developers={developers.map((d) => ({ slug: d.slug, name: d.name }))}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
