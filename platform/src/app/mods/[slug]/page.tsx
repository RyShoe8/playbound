import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Puzzle } from "lucide-react";
import { getMod } from "@/lib/mods";
import { getGame } from "@/lib/catalog";
import { isLauncherInstallable } from "@/lib/launcher";
import { Badge } from "@/components/ui/bits";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";

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
  const canOneClickBase = baseGame ? isLauncherInstallable(baseGame) : false;

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
        <p className="text-sm font-semibold">
          {mod.downloadKind === "external" ? "Open with the PlayBound Launcher" : "Install with the PlayBound Launcher"}
        </p>
        <p className="text-sm text-muted-foreground">
          {mod.downloadKind === "external" ? (
            <>
              This entry opens the official page in your browser. The launcher does not download a package for it.
            </>
          ) : (
            <>
              The launcher installs this into{" "}
              <code className="text-play">
                {mod.installRelativePath ? `${mod.installRelativePath}/` : "(game root)"}
              </code>
              {baseGame ? ` for ${baseGame.title}` : ""}. If the base game is missing, it will install that first.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <LauncherInstallButton
            slug={mod.slug}
            kind="install-mod"
            label={mod.downloadKind === "external" ? "Open with launcher" : "Install mod"}
            className="bg-play text-play-foreground border-transparent"
          />
          {canOneClickBase && (
            <LauncherInstallButton
              slug={mod.baseGameSlug}
              label={`Install ${baseGame?.title ?? "base game"}`}
            />
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
