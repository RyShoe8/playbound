import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Map as MapIcon, Server, Users } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { launcherJoinUrl } from "@/lib/launcher";
import { loadPublicServer } from "@/lib/dedicatedHosting/view";
import { loadPublicTier } from "@/lib/dedicatedHosting/publicTier";
import { getServerSettingProfile } from "@/lib/serverControl/settings";

type Props = { params: Promise<{ gameSlug: string; serverSlug: string }> };

async function load(params: Props["params"]) {
  const { gameSlug, serverSlug } = await params;
  // Live by nature: who is on it and what it is playing right now.
  await connection();
  return loadPublicServer(decodeURIComponent(gameSlug), decodeURIComponent(serverSlug)).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const server = await load(params);
  if (!server) return { title: "Server not found", robots: { index: false } };
  const meta = pageMetadata({
    title: `${server.name} — ${server.gameTitle} Server`,
    description: server.description || `A PlayBound-hosted ${server.gameTitle} server. Join in one click from the PlayBound launcher.`,
    path: `/servers/${server.gameSlug}/${server.slug}`,
  });
  // Unlisted servers are reachable by link only.
  return server.listed ? meta : { ...meta, robots: { index: false, follow: false } };
}

export default async function PublicServerPage({ params }: Props) {
  const server = await load(params);
  if (!server) notFound();
  const { tier } = await loadPublicTier();
  const region = tier.regions.find((r) => r.key === server.regionKey)?.label || server.regionKey;
  const mapLabel = server.currentMap
    ? getServerSettingProfile(server.gameSlug)?.maps?.options.find((o) => o.value === server.currentMap)?.label || server.currentMap
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-primary uppercase">
          PlayBound Hosted
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{server.name}</h1>
        <p className="text-muted-foreground">
          <Link href={`/games/${server.gameSlug}`} className="hover:text-primary hover:underline">{server.gameTitle}</Link>
          {server.editionSlug ? ` • ${server.editionSlug}` : ""}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="size-3.5" aria-hidden /> Players</p>
          <p className="mt-1 text-lg font-semibold">
            {server.running ? `${server.players ?? "—"} / ${server.slots}` : "Offline"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><MapIcon className="size-3.5" aria-hidden /> Current map</p>
          <p className="mt-1 text-lg font-semibold">{server.running && mapLabel ? mapLabel : "—"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Globe className="size-3.5" aria-hidden /> Region</p>
          <p className="mt-1 text-lg font-semibold">{region}</p>
        </div>
      </section>

      {server.description ? <p className="text-base">{server.description}</p> : null}

      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        {server.running && server.host && server.port ? (
          <>
            <a
              href={launcherJoinUrl(server.gameSlug, server.host, server.port, server.name)}
              className="inline-flex rounded-lg bg-play px-5 py-2.5 text-sm font-bold text-play-foreground hover:brightness-110"
            >
              Join Server
            </a>
            <p className="text-sm text-muted-foreground">
              Opens the PlayBound launcher and connects you. Don&apos;t have {server.gameTitle} yet?{" "}
              <Link href={`/games/${server.gameSlug}`} className="text-primary hover:underline">Get it on PlayBound</Link>, then join.
            </p>
            <p className="font-mono text-xs text-muted-foreground">{server.host}:{server.port}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This server is offline right now. Check back later.</p>
        )}
      </section>

      <aside className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm">
        <Server className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>
          Hosted on <Link href="/hosting" className="font-semibold text-primary hover:underline">PlayBound Dedicated</Link> — run your own
          {" "}{server.gameTitle} server, switch games whenever you like, and manage it all from PlayBound.
        </p>
      </aside>
    </div>
  );
}
