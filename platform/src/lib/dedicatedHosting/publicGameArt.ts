import { cacheLife } from "next/cache";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import type { GameArt } from "@/lib/data/types";

export type HostingGameArt = { coverImage?: string; art: GameArt };

/** The hosting lineup can include draft games; the public catalog deliberately cannot. */
export async function hostingGameArt(slugs: string[]): Promise<Record<string, HostingGameArt>> {
  "use cache";
  cacheLife("hours");
  if (!slugs.length) return {};
  try {
    await dbConnect();
    const rows = await CatalogGame.find({ slug: { $in: slugs } })
      .select("slug coverImage art").lean() as Array<{ slug: string; coverImage?: string; art?: GameArt }>;
    return Object.fromEntries(rows.map((row) => [row.slug, {
      coverImage: row.coverImage || undefined,
      art: row.art || { from: "#1e293b", to: "#0f172a", icon: "Gamepad2" },
    }]));
  } catch {
    return {};
  }
}
