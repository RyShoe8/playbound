import type { Metadata } from "next";
import { listDevelopers } from "@/lib/developers";
import { listAllGames } from "@/lib/catalog";
import { emptyModDraft } from "@/lib/modPayload";
import { ModEditorForm } from "@/components/admin/ModEditorForm";

export const metadata: Metadata = { title: "Admin · New mod" };

export default async function AdminNewModPage() {
  const games = await listAllGames();
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">New mod</h1>
        <p className="mt-1 text-muted-foreground">
          Tie the mod to a base game and set the install folder relative to that game&apos;s directory.
        </p>
      </div>
      <ModEditorForm
        mode="create"
        initial={emptyModDraft()}
        developers={(await listDevelopers()).map((d) => ({ slug: d.slug, name: d.name }))}
        games={games.map((g) => ({ slug: g.slug, title: g.title }))}
      />
    </div>
  );
}
