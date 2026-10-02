import Link from "next/link";
import { GameArt } from "@/components/GameArt";
import type { HostingGameArt } from "@/lib/dedicatedHosting/publicGameArt";
import type { PublicHostingGame } from "@/lib/dedicatedHosting/publicTier";

const editionLabel = (slug: string) => slug.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const STATIC_COVERS = new Set(["openra", "xonotic", "supertuxkart", "mindustry", "openttd", "warzone-2100", "hedgewars"]);

export function HostingGameTile({ game, art, compact = false }: {
  game: PublicHostingGame;
  art?: HostingGameArt;
  compact?: boolean;
}) {
  const coverImage = art?.coverImage || (STATIC_COVERS.has(game.gameSlug) ? `/games/${game.gameSlug}/cover.webp` : undefined);
  return <Link href={`/hosting/${game.gameSlug}`} className={`group flex overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50 ${compact ? "items-center gap-3 p-2" : "flex-col"}`}>
    <GameArt game={{ art: art?.art || { from: "#1e293b", to: "#0f172a", icon: "Gamepad2" }, coverImage, title: game.title, status: "published" }} showTitle={false} iconSize="sm" className={compact ? "size-12 shrink-0 rounded-lg" : "aspect-[16/10] w-full"} />
    <div className={compact ? "min-w-0 flex-1" : "p-3"}>
      <p className="line-clamp-1 text-sm font-semibold group-hover:text-primary">{game.title}</p>
      {game.editions.length ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">Editions: {game.editions.map(editionLabel).join(", ")}</p> : <p className="mt-0.5 text-xs text-muted-foreground">Base game</p>}
    </div>
  </Link>;
}
