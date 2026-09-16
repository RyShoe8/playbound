import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { listAllEditions } from "@/lib/editions";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { AdminEditionsTable } from "@/components/admin/AdminEditionsTable";

export const metadata: Metadata = {
  title: "Admin · All Editions",
};

export default async function AdminAllEditionsPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  await dbConnect();
  const [editions, games] = await Promise.all([
    listAllEditions(true),
    CatalogGame.find().select("slug title").lean(),
  ]);

  const gameTitlesBySlug: Record<string, string> = {};
  for (const g of games) {
    gameTitlesBySlug[String(g.slug)] = String(g.title);
  }

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Editions</h1>
          <p className="mt-1 text-muted-foreground">
            Curated variations, server clients, and distinct distributions across PlayBound titles.
          </p>
        </div>
      </div>

      <AdminEditionsTable editions={editions} gameTitlesBySlug={gameTitlesBySlug} />
    </div>
  );
}
