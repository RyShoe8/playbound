import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";
import { canEditGame } from "@/lib/developerAccess";
import { DeveloperGameEditorForm } from "@/components/developer/DeveloperGameEditorForm";
import { ExternalLink, ArrowLeft } from "lucide-react";

export default async function DeveloperGameEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login?next=/developer");
  }

  const { slug } = await params;
  await dbConnect();

  const doc = await CatalogGame.findOne({ slug }).lean();
  if (!doc) notFound();

  const allowed = await canEditGame(session.user, doc);
  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-lg font-bold">Access Denied</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          You do not have permission to manage this game page. If you are the developer or creator,
          please submit a claim request.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/developer"
            className="rounded-lg border border-border bg-secondary px-4 py-2 text-xs font-bold"
          >
            Dashboard
          </Link>
          <Link
            href="/developer/claim"
            className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            Claim Ownership
          </Link>
        </div>
      </div>
    );
  }

  // Prepare serializable game data for the form
  const rawGame = doc;
  const serializableGame = {
    slug: String(rawGame.slug),
    title: String(rawGame.title),
    tagline: String(rawGame.tagline || ""),
    description: String(rawGame.description || ""),
    website: String(rawGame.website || ""),
    githubRepo: rawGame.githubRepo ? String(rawGame.githubRepo) : null,
    genres: Array.isArray(rawGame.genres) ? rawGame.genres : [],
    tags: Array.isArray(rawGame.tags) ? rawGame.tags : [],
    aliases: Array.isArray(rawGame.aliases) ? rawGame.aliases : [],
    license: String(rawGame.license || "Proprietary"),
    releaseYear: Number(rawGame.releaseYear) || 2024,
    sizeMB: Number(rawGame.sizeMB) || 0,
    platforms: Array.isArray(rawGame.platforms) ? rawGame.platforms : ["Windows"],
    features: Array.isArray(rawGame.features) ? rawGame.features : [],
    maxPlayers: rawGame.maxPlayers != null ? Number(rawGame.maxPlayers) : null,
    launchMethods: Array.isArray(rawGame.launchMethods) ? rawGame.launchMethods : ["install"],
    browserPlayable: Boolean(rawGame.browserPlayable),
    steamDeck: Boolean(rawGame.steamDeck),
    steamAppId: rawGame.steamAppId ? String(rawGame.steamAppId) : null,
    androidStoreUrl: rawGame.androidStoreUrl ? String(rawGame.androidStoreUrl) : null,
    iosStoreUrl: rawGame.iosStoreUrl ? String(rawGame.iosStoreUrl) : null,
    coverImage: rawGame.coverImage ? String(rawGame.coverImage) : null,
    screenshots: Array.isArray(rawGame.screenshots) ? rawGame.screenshots.map(String) : [],
    videos: Array.isArray(rawGame.videos) ? rawGame.videos.map(String) : [],
    systemRequirements: rawGame.systemRequirements
      ? {
          min: String(rawGame.systemRequirements.min || ""),
          recommended: String(rawGame.systemRequirements.recommended || ""),
        }
      : { min: "Windows 10, 4GB RAM", recommended: "Windows 11, 8GB RAM" },
    hardwareRequirements: rawGame.hardwareRequirements || null,
    controls: rawGame.controls || null,
    launcherInstall: rawGame.launcherInstall || null,
    communityLinks: rawGame.communityLinks || null,
    qualityBar: rawGame.qualityBar || null,
    whyWePickedIt: rawGame.whyWePickedIt ? String(rawGame.whyWePickedIt) : null,
    thatOneThing: rawGame.thatOneThing ? String(rawGame.thatOneThing) : null,
    bestFor: Array.isArray(rawGame.bestFor) ? rawGame.bestFor.map(String) : [],
    notFor: Array.isArray(rawGame.notFor) ? rawGame.notFor.map(String) : [],
    status: String(rawGame.status || "published"),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/developer"
            className="flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Edit {serializableGame.title}</h1>
            <p className="text-xs text-muted-foreground">
              Slug: <span className="font-mono text-foreground">{serializableGame.slug}</span>
            </p>
          </div>
        </div>

        <Link
          href={`/games/${serializableGame.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary/80"
        >
          <ExternalLink className="size-3.5" />
          View Live Page
        </Link>
      </div>

      <DeveloperGameEditorForm game={serializableGame} />
    </div>
  );
}
