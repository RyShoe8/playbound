import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { listManageableGames, listManageableDevelopers } from "@/lib/developerAccess";
import { Gamepad2, Building2, ExternalLink, Edit3, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";

export default async function DeveloperDashboard() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id || "";

  const [games, developers] = await Promise.all([
    listManageableGames(userId),
    listManageableDevelopers(userId),
  ]);

  return (
    <div className="space-y-8">
      {/* Editorial boundary notice */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-foreground">PlayBound Editorial Standard &amp; Developer Ownership</h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              You own your game&apos;s presentation — descriptions, trailers, screenshots, system requirements, and installation
              links. PlayBound&apos;s Quality Bar assessments, editorial reviews, and staff highlights are independently authored
              and maintained by our editorial staff to preserve reader trust and neutrality.
            </p>
          </div>
        </div>
      </div>

      {/* Header & Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Developer Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your games and studio identity on PlayBound.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/developer/claim"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-3.5 py-2 text-xs font-bold text-foreground transition-colors hover:bg-secondary/80"
          >
            Claim Another Game
          </Link>
          <Link
            href="/submit-game"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Submit New Game
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Gamepad2 className="size-4 text-primary" />
            Games Managed
          </div>
          <p className="mt-2 text-2xl font-extrabold">{games.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Building2 className="size-4 text-primary" />
            Studios Linked
          </div>
          <p className="mt-2 text-2xl font-extrabold">{developers.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-4 text-amber-400" />
            Account Role
          </div>
          <p className="mt-2 text-base font-bold capitalize">{session?.user?.role || "User"}</p>
        </div>
      </div>

      {/* Games List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Your Games</h2>
        </div>

        {games.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center sm:p-12">
            <Gamepad2 className="mx-auto size-10 text-muted-foreground/50" />
            <h3 className="mt-3 text-sm font-bold">No games linked yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              If your game is already listed on PlayBound, claim ownership to start managing its page, screenshots, and download links.
            </p>
            <div className="mt-5">
              <Link
                href="/developer/claim"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Claim an Existing Game
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => (
              <div
                key={String(g.slug)}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
              >
                <div className="relative h-36 w-full bg-secondary">
                  {g.coverImage ? (
                    <Image
                      src={String(g.coverImage)}
                      alt={String(g.title)}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
                      No cover image
                    </div>
                  )}
                  <span className="absolute top-2.5 right-2.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase text-white backdrop-blur-xs">
                    {String(g.status || "published")}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="line-clamp-1 font-bold text-foreground">{String(g.title)}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {String(g.tagline || "No tagline set")}
                  </p>
                  <div className="mt-auto pt-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/developer/games/${g.slug}/edit`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        <Edit3 className="size-3.5" />
                        Edit Page
                      </Link>
                      <Link
                        href={`/games/${g.slug}`}
                        target="_blank"
                        className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground"
                        title="View Public Page"
                      >
                        <ExternalLink className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Studio Profile Section */}
      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-bold tracking-tight">Your Studio Profiles</h2>
        {developers.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
            <Building2 className="mx-auto size-8 text-muted-foreground/50" />
            <p className="mt-2 text-xs text-muted-foreground">
              No developer studio profile is linked to your account yet. Claim your studio profile to manage your bio, website, and team links.
            </p>
            <div className="mt-4">
              <Link
                href="/developer/claim"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                Claim Studio Profile &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {developers.map((dev) => (
              <div
                key={String(dev.slug)}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
              >
                <div>
                  <h3 className="font-bold text-foreground">{String(dev.name)}</h3>
                  <p className="text-xs text-muted-foreground">
                    {String(dev.tagline || dev.location || "Studio profile")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href="/developer/profile/edit"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-secondary/80"
                  >
                    <Edit3 className="size-3" />
                    Edit Studio
                  </Link>
                  <Link
                    href={`/developers/${dev.slug}`}
                    target="_blank"
                    className="inline-flex size-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                    title="View Studio on Site"
                  >
                    <ExternalLink className="size-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
