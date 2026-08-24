import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { listDevelopers } from "@/lib/developers";
import { getGame } from "@/lib/catalog";
import { gameAccessTiers } from "@/lib/access/tiers";
import type { GamePayload } from "@/lib/gamePayload";
import { toPayloadLauncherInstall, toPayloadCommunityLinks, toPayloadAccess } from "@/lib/gamePayload";
import { GameEditorForm } from "@/components/admin/GameEditorForm";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { normalizeStatus } from "@/lib/catalogStatus";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Admin · Edit ${slug}` } satisfies Metadata;
}

export default async function AdminEditGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug, { includeUnpublished: true });
  if (!game) notFound();

  let published = true;
  let status: GamePayload["status"] = "published";
  let submissionId: string | null = null;
  let managedBy: "admin" | "developer" = "admin";
  let ownerUserId: string | null = null;
  let serverLobbyAuth: GamePayload["serverLobbyAuth"] = null;
  try {
    await dbConnect();
    const doc = await CatalogGame.findOne({ slug }).lean();
    if (doc) {
      status = normalizeStatus(doc as { status?: unknown; published?: unknown });
      published = status === "published";
      submissionId = doc.submissionId ? String(doc.submissionId) : null;
      managedBy = (doc.managedBy as "admin" | "developer") || "admin";
      ownerUserId = doc.ownerUserId ? String(doc.ownerUserId) : null;
      const auth = doc.serverLobbyAuth as
        | { username?: string | null; password?: string | null }
        | null
        | undefined;
      if (auth?.username || auth?.password) {
        serverLobbyAuth = {
          username: auth.username ?? null,
          password: auth.password ?? null,
        };
      }
    }
  } catch {
    /* seed-only */
  }

  const initial: GamePayload = {
    ...game,
    // Optional on Game (older documents predate it), required on the payload.
    aliases: game.aliases ?? [],
    complete: Boolean(game.complete),
    masterCopy: Boolean(game.masterCopy),
    steamAppId: game.steamAppId ?? null,
    androidStoreUrl: game.androidStoreUrl ?? null,
    iosStoreUrl: game.iosStoreUrl ?? null,
    githubRepo: game.githubRepo ?? null,
    coverImage: game.coverImage ?? null,
    screenshots: game.screenshots ?? [],
    videos: game.videos ?? [],
    launcherInstall: toPayloadLauncherInstall(game.launcherInstall),
    serverLobbyAuth,
    communityLinks: toPayloadCommunityLinks(game.communityLinks),
    developerName: null,
    published,
    status,
    submissionId,
    managedBy,
    ownerUserId,
    qualityBar: game.qualityBar ?? null,
    longDescription: game.longDescription,
    whyWePickedIt: game.whyWePickedIt,
    thatOneThing: game.thatOneThing,
    installSteps: game.installSteps ?? [],
    faq: game.faq ?? [],
    bestFor: game.bestFor ?? [],
    notFor: game.notFor ?? [],
    comparableTo: game.comparableTo ?? [],
    access: toPayloadAccess(game.access),
  };

  const [developers, allGames, catalogTiers] = await Promise.all([
    listDevelopers(),
    CatalogGame.find({}).select("slug title access.priceType").sort({ title: 1 }).lean(),
    gameAccessTiers(),
  ]);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Edit {game.title}</h1>
          <p className="mt-1 text-muted-foreground">
            Published goes live for everyone; Testing is admin-only on the site and launcher.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/games/${game.slug}/editions`} className="btn-secondary whitespace-nowrap">
            Manage Editions
          </Link>
          <Link href={`/admin/games/${game.slug}/mods`} className="btn-secondary whitespace-nowrap">
            Manage Mods
          </Link>
        </div>
      </div>
      <GameEditorForm
        mode="edit"
        initial={initial}
        developers={developers.map((d) => ({ slug: d.slug, name: d.name }))}
        catalogGames={allGames.map((g) => ({
          slug: g.slug,
          title: g.title,
          priceType: g.access?.priceType,
        }))}
        catalogTiers={catalogTiers}
      />
    </div>
  );
}
