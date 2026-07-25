import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, Puzzle } from "lucide-react";
import { getMod } from "@/lib/mods";
import { getGame } from "@/lib/catalog";
import { launcherInstallModUrl, isOneClickSlug, launcherInstallUrl } from "@/lib/launcher";
import { Badge } from "@/components/ui/bits";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mod = await getMod(slug);
  return { title: mod ? mod.title : "Mod Not Found" } satisfies Metadata;
}

export default async function ModPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mod = await getMod(slug);
  if (!mod) notFound();

  const baseGame = await getGame(mod.baseGameSlug);
  const canOneClickBase = isOneClickSlug(mod.baseGameSlug);

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="space-y-3">
        <Badge tone="brand">
          <Puzzle className="size-3" /> Mod
        </Badge>
        <h1 className="text-4xl font-extrabold tracking-tight">{mod.title}</h1>
        <p className="text-lg text-muted-foreground">{mod.tagline}</p>
        {baseGame && (
          <p className="text-sm text-muted-foreground">
            For{" "}
            <Link href={`/games/${baseGame.slug}`} className="font-semibold text-primary hover:underline">
              {baseGame.title}
            </Link>
          </p>
        )}
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{mod.description}</p>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Install with the PlayBound Launcher</p>
        <p className="text-sm text-muted-foreground">
          Requires {baseGame?.title ?? "the base game"} installed (or pick its folder). The launcher
          extracts into{" "}
          <code className="text-play">
            {mod.installRelativePath ? `${mod.installRelativePath}/` : "(game root)"}
          </code>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={launcherInstallModUrl(mod.slug)}
            className="inline-flex items-center gap-2 rounded-full bg-play px-4 py-2 text-sm font-bold text-play-foreground"
          >
            <Download className="size-4" /> Install mod
          </a>
          {canOneClickBase && (
            <a
              href={launcherInstallUrl(mod.baseGameSlug)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
            >
              Install {baseGame?.title ?? "base game"}
            </a>
          )}
          {baseGame && (
            <Link
              href={`/games/${baseGame.slug}?tab=mods`}
              className="inline-flex items-center rounded-full border border-border bg-secondary px-4 py-2 text-sm font-bold"
            >
              All mods for {baseGame.title}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
