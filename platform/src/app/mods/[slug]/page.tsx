import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth/next";
import { Monitor, Play, Puzzle, Terminal } from "lucide-react";
import { authOptions } from "@/lib/auth";
import dbConnect from "@/lib/db";
import LibraryModEntry from "@/lib/models/LibraryModEntry";
import { getMod } from "@/lib/mods";
import { getGame } from "@/lib/catalog";
import { viewerIsAdmin } from "@/lib/requestIncludesTesting";
import { isLauncherInstallable, launcherPlayModUrl } from "@/lib/launcher";
import { Badge } from "@/components/ui/bits";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { ModArt } from "@/components/ModArt";
import { pageMetadata, privateMetadata, sizeLabel } from "@/lib/seo";
import { resolveModVisual } from "@/lib/modMedia";
import {
  JsonLd,
  graph,
  faqSchema,
  breadcrumbSchema,
  ORGANIZATION_ID,
} from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/site";

const PLATFORM_LABELS: Record<string, string> = {
  all: "All platforms",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const includeTesting = await viewerIsAdmin();
  const mod = await getMod(slug, { includeTesting });
  if (!mod) return { title: "Mod Not Found" };
  if (mod.status === "testing") return privateMetadata(mod.title);

  const baseGame = await getGame(mod.baseGameSlug, { includeTesting });
  const base = baseGame?.title ?? mod.baseGameSlug;

  return pageMetadata({
    title: `${mod.title} — Free ${base} Mod`,
    description: `${mod.whatItChanges || mod.tagline} Free add-on for ${base}${mod.sizeMB ? `, roughly ${sizeLabel(mod.sizeMB)}` : ""}. One-click install through PlayBound.`,
    path: `/mods/${mod.slug}`,
    images: (() => {
      const visual = resolveModVisual(mod, baseGame);
      return visual.kind === "image" ? [visual.url] : undefined;
    })(),
  });
}

export default async function ModPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const includeTesting = await viewerIsAdmin();
  const mod = await getMod(slug, { includeTesting });
  if (!mod) notFound();

  const baseGame = await getGame(mod.baseGameSlug, { includeTesting });
  const canOneClickBase = baseGame ? isLauncherInstallable(baseGame) : false;

  let modInstalled = false;
  if (mod.downloadKind !== "external") {
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.id) {
        await dbConnect();
        const entry = await LibraryModEntry.findOne({
          userId: session.user.id,
          modSlug: mod.slug,
          installed: true,
        })
          .select("_id")
          .lean();
        modInstalled = Boolean(entry);
      }
    } catch (err) {
      console.error("Mod page library load failed:", err);
    }
  }

  const base = baseGame?.title ?? mod.baseGameSlug;
  const showPlay = modInstalled && canOneClickBase;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          {
            "@type": "SoftwareApplication",
            name: mod.title,
            url: absoluteUrl(`/mods/${mod.slug}`),
            description: mod.longDescription || mod.description,
            applicationCategory: "Game",
            applicationSubCategory: "Game Modification",
            license: mod.license,
            isAccessibleForFree: true,
            ...(mod.sizeMB ? { fileSize: `${mod.sizeMB} MB` } : {}),
            ...(mod.githubRepo
              ? { sameAs: [`https://github.com/${mod.githubRepo}`, mod.website] }
              : { sameAs: [mod.website] }),
            publisher: { "@id": ORGANIZATION_ID },
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            ...(baseGame
              ? {
                  requirements: `Requires ${baseGame.title}`,
                  isPartOf: {
                    "@type": "VideoGame",
                    name: baseGame.title,
                    url: absoluteUrl(`/games/${baseGame.slug}`),
                  },
                }
              : {}),
          },
          mod.installSteps?.length
            ? {
                "@type": "HowTo",
                name: `How to install ${mod.title} for ${base}`,
                description: `Step-by-step instructions for installing ${mod.title}, a free add-on for ${base}.`,
                estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
                step: mod.installSteps.map((s, i) => ({
                  "@type": "HowToStep",
                  position: i + 1,
                  name: `Step ${i + 1}`,
                  text: s.command ? `${s.text} Command: ${s.command}` : s.text,
                })),
              }
            : null,
          faqSchema(mod.faq ?? []),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Mods", path: "/mods" },
            { name: mod.title, path: `/mods/${mod.slug}` },
          ])
        )}
      />

      <div className="space-y-3">
        <ModArt
          mod={mod}
          baseGame={baseGame}
          className="h-48 w-full rounded-xl sm:h-56"
          alt={`${mod.title} cover`}
        />
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
            {baseGame.launchMethods.includes("server") && (
              <>
                {" · "}
                <Link
                  href={`/servers?game=${encodeURIComponent(baseGame.slug)}&mod=${encodeURIComponent(mod.slug)}`}
                  className="font-semibold text-primary hover:underline"
                >
                  Browse servers
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {/* Direct answer first — what this mod actually does. */}
      {mod.whatItChanges && (
        <section className="rounded-xl border-l-4 border-primary bg-card p-5">
          <h2 className="text-xs font-semibold tracking-wide text-primary uppercase">
            What it changes
          </h2>
          <p className="mt-2 leading-relaxed">{mod.whatItChanges}</p>
        </section>
      )}

      <section>
        <h2 className="sr-only">About {mod.title}</h2>
        {mod.longDescription ? (
          <div className="space-y-4 leading-relaxed text-muted-foreground">
            {mod.longDescription.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {mod.description}
          </p>
        )}
      </section>

      {mod.compatibility && (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span className="font-semibold">Compatibility: </span>
          <span className="text-muted-foreground">{mod.compatibility}</span>
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">
          {mod.downloadKind === "external" ? "Download page" : "Install with the PlayBound Launcher"}
        </p>
        <p className="text-sm text-muted-foreground">
          {mod.downloadKind === "external" ? (
            <>
              This package isn&apos;t one-click yet. Open the official download page in your browser, then place
              files in the game&apos;s mods folder.
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
          {showPlay ? (
            <a
              href={launcherPlayModUrl(mod.slug)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-play px-4 py-2 text-sm font-bold text-play-foreground hover:brightness-110"
            >
              <Play className="size-4 fill-current" /> Play {base}
            </a>
          ) : null}
          {mod.downloadKind === "external" ? (
            <a
              href={mod.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-play px-4 py-2 text-sm font-bold text-play-foreground"
            >
              Open download page
            </a>
          ) : (
            <LauncherInstallButton
              slug={mod.slug}
              kind="install-mod"
              label={showPlay ? "Reinstall mod" : "Install mod"}
              className={
                showPlay
                  ? "border border-border bg-secondary"
                  : "bg-play text-play-foreground border-transparent"
              }
            />
          )}
          {canOneClickBase && !showPlay && (
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

      {mod.installSteps?.length ? (
        <section>
          <h2 className="text-xl font-bold">How to install {mod.title}</h2>
          <ol className="mt-4 space-y-3">
            {mod.installSteps.map((step, i) => (
              <li key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    {step.platform !== "all" && (
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
                        <Monitor className="size-3" />
                        {PLATFORM_LABELS[step.platform] ?? step.platform}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {step.text}
                    </p>
                    {step.command && (
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-2.5 text-xs">
                        <code className="flex items-center gap-2">
                          <Terminal className="size-3 shrink-0 text-primary" />
                          {step.command}
                        </code>
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {mod.faq?.length ? (
        <section>
          <h2 className="text-xl font-bold">
            Frequently asked questions about {mod.title}
          </h2>
          <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {mod.faq.map((item) => (
              <div key={item.q} className="p-4">
                <h3 className="font-semibold">{item.q}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
