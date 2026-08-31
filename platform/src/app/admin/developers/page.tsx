import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listAllDevelopers } from "@/lib/developers";
import { listAllGames } from "@/lib/catalog";

export const metadata: Metadata = { title: "Admin · Developers" };

export default async function AdminDevelopersPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const [developers, games] = await Promise.all([listAllDevelopers(), listAllGames()]);

  const gameCount = new Map<string, number>();
  for (const game of games) {
    gameCount.set(game.developerSlug, (gameCount.get(game.developerSlug) ?? 0) + 1);
  }

  // A game pointing at a developer that no longer exists shows a broken credit
  // and a 404 profile link, so surface it here rather than leaving it to be
  // found on the public site.
  const known = new Set(developers.map((d) => d.slug));
  const orphanedSlugs = [...gameCount.keys()].filter((s) => s && !known.has(s));

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Developers</h1>
          <p className="mt-1 text-muted-foreground">
            The teams credited on games and mods, and shown on /developers.
          </p>
        </div>
        <Link
          href="/admin/developers/new"
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
        >
          <Plus className="size-4" /> New developer
        </Link>
      </div>

      {orphanedSlugs.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-400/10 px-4 py-3 text-sm">
          <p className="font-semibold text-amber-500">
            {orphanedSlugs.length} game{orphanedSlugs.length === 1 ? "" : "s"} credit a developer
            that doesn&apos;t exist
          </p>
          <p className="mt-1 text-muted-foreground">
            Unknown slug{orphanedSlugs.length === 1 ? "" : "s"}:{" "}
            <span className="font-mono">{orphanedSlugs.join(", ")}</span>. Create the developer, or
            reassign those games.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Developer</th>
              <th className="px-4 py-3 font-semibold">Games</th>
              <th className="px-4 py-3 font-semibold">Location</th>
              <th className="px-4 py-3 font-semibold">Published</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {developers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No developers yet.
                </td>
              </tr>
            ) : (
              developers.map((d) => {
                const count = gameCount.get(d.slug) ?? 0;
                return (
                  <tr key={d.slug} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/developers/${d.slug}/edit`}
                        className="font-semibold hover:underline"
                      >
                        {d.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{d.slug}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {count === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        count
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{d.location || "—"}</td>
                    <td className="px-4 py-2.5">
                      {d.published ? (
                        <span className="text-play">Live</span>
                      ) : (
                        <span className="text-muted-foreground">Draft</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/admin/developers/${d.slug}/edit`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
