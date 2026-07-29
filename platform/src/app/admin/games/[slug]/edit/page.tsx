import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { developers } from "@/lib/data";
import { getGame } from "@/lib/catalog";
import type { GamePayload } from "@/lib/gamePayload";
import { toPayloadLauncherInstall } from "@/lib/gamePayload";
import { GameEditorForm } from "@/components/admin/GameEditorForm";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Admin · Edit ${slug}` } satisfies Metadata;
}

export default async function AdminEditGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = await getGame(slug, { includeUnpublished: true });
  if (!game) notFound();

  let published = true;
  let submissionId: string | null = null;
  let managedBy: "admin" | "developer" = "admin";
  let ownerUserId: string | null = null;
  let serverLobbyAuth: GamePayload["serverLobbyAuth"] = null;
  try {
    await dbConnect();
    const doc = await CatalogGame.findOne({ slug }).lean();
    if (doc) {
      published = Boolean(doc.published);
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
    steamAppId: game.steamAppId ?? null,
    githubRepo: game.githubRepo ?? null,
    coverImage: game.coverImage ?? null,
    screenshots: game.screenshots ?? [],
    videos: game.videos ?? [],
    launcherInstall: toPayloadLauncherInstall(game.launcherInstall),
    serverLobbyAuth,
    developerName: null,
    published,
    submissionId,
    managedBy,
    ownerUserId,
  };

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Edit {game.title}</h1>
        <p className="mt-1 text-muted-foreground">
          Changes go live on the public site when Published is on (no code deploy needed for catalog text).
        </p>
      </div>
      <GameEditorForm
        mode="edit"
        initial={initial}
        developers={developers.map((d) => ({ slug: d.slug, name: d.name }))}
      />
    </div>
  );
}
