import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listAllCollections } from "@/lib/collections";
import { listGames } from "@/lib/catalog";

export const metadata: Metadata = { title: "Admin · Collections" };

export default async function AdminCollectionsPage() {
  const [collections, games] = await Promise.all([listAllCollections(), listGames()]);
  const known = new Set(games.map((g) => g.slug));

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Collections</h1>
          <p className="mt-1 text-muted-foreground">
            Curated groupings shown on /collections and previewed on Discover.
          </p>
        </div>
        <Link
          href="/admin/collections/new"
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
        >
          <Plus className="size-4" /> New collection
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Collection</th>
              <th className="px-4 py-3 font-semibold">Games</th>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="px-4 py-3 font-semibold">Published</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {collections.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No collections yet.
                </td>
              </tr>
            ) : (
              collections.map((c) => {
                // A slug that no longer resolves would silently vanish from the
                // public page, so surface it here instead.
                const missing = c.gameSlugs.filter((s) => !known.has(s));
                return (
                  <tr key={c.slug} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/collections/${c.slug}/edit`}
                        className="font-semibold hover:underline"
                      >
                        {c.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{c.slug}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {c.gameSlugs.length}
                      {missing.length > 0 && (
                        <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-500">
                          {missing.length} missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.sortOrder}</td>
                    <td className="px-4 py-2.5">
                      {c.published ? (
                        <span className="text-play">Live</span>
                      ) : (
                        <span className="text-muted-foreground">Draft</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/admin/collections/${c.slug}/edit`}
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
