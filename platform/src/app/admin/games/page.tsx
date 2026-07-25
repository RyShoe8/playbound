import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listAllGames } from "@/lib/catalog";
import { GameArt } from "@/components/GameArt";

export const metadata: Metadata = { title: "Admin · Games" };

export default async function AdminGamesPage() {
  const games = await listAllGames();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Games</h1>
          <p className="mt-1 text-muted-foreground">Create, edit, and publish catalog entries in MongoDB.</p>
        </div>
        <Link
          href="/admin/games/new"
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:brightness-110"
        >
          <Plus className="size-4" /> New game
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Game</th>
              <th className="px-4 py-3 font-semibold">Slug</th>
              <th className="px-4 py-3 font-semibold">Published</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.slug} className="border-b border-border bg-card last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <GameArt game={g} showTitle={false} iconSize="sm" className="size-8 rounded-md" />
                    <span className="font-semibold">{g.title}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{g.slug}</td>
                <td className="px-4 py-2.5">
                  <span className={g.published ? "text-primary font-semibold" : "text-muted-foreground"}>
                    {g.published ? "Yes" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {g.updatedAt ? new Date(g.updatedAt).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link href={`/admin/games/${g.slug}/edit`} className="font-semibold text-primary hover:underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
