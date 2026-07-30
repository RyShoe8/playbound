import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Monitor, Terminal } from "lucide-react";
import { getGame, developersBySlug } from "@/lib/catalog";
import { isLauncherInstallable } from "@/lib/launcher";
import { pageMetadata, sizeLabel } from "@/lib/seo";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import {
  JsonLd,
  graph,
  howToSchema,
  faqSchema,
  breadcrumbSchema,
} from "@/components/JsonLd";
import { deriveInstallSteps, deriveFaq } from "@/lib/enrich";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) return { title: "Game Not Found" };

  return pageMetadata({
    title: `How to Install ${game.title} Free — ${game.platforms.join(", ")}`,
    description: `Step-by-step instructions to download and install ${game.title} for free on ${game.platforms.join(", ")}. ${sizeLabel(game.sizeMB)} download, ${game.license}, no payment required.`,
    path: `/games/${game.slug}/install`,
    images: game.coverImage ? [game.coverImage] : undefined,
  });
}

const PLATFORM_LABELS: Record<string, string> = {
  all: "All platforms",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

export default async function InstallPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGame(slug);
  if (!game) notFound();

  const developer = developersBySlug.get(game.developerSlug);
  // Same derivation the importer uses, so a hand-edited guide and a generated
  // one never disagree about the facts.
  const steps = game.installSteps?.length ? game.installSteps : deriveInstallSteps(game);
  const oneClick = isLauncherInstallable(game);
  const installFaq = game.faq?.length ? game.faq : deriveFaq(game);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <JsonLd
        data={graph(
          howToSchema(game, steps),
          faqSchema(installFaq),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Games", path: "/discover" },
            { name: game.title, path: `/games/${game.slug}` },
            { name: "Install", path: `/games/${game.slug}/install` },
          ])
        )}
      />

      <Link
        href={`/games/${game.slug}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to {game.title}
      </Link>

      <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
        How to install {game.title} for free
      </h1>

      {/* Direct answer first. */}
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        {game.title} is a free {game.genres[0]?.toLowerCase()} game released under{" "}
        {game.license}. It runs on {game.platforms.join(", ")}, needs about{" "}
        {sizeLabel(game.sizeMB)} of disk space, and requires no account, payment or
        trial.{" "}
        {oneClick
          ? "The fastest route is the PlayBound Launcher, which handles the download and setup in one click."
          : `Download it from the official site at ${game.website}.`}
      </p>

      {oneClick && (
        <div className="mt-6 rounded-xl border border-border bg-card p-5">
          <p className="flex items-center gap-2 font-bold">
            <Download className="size-4 text-primary" /> One-click install
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            PlayBound fetches the official release — no third-party mirrors.
          </p>
          <div className="mt-4">
            <LauncherInstallButton
              slug={game.slug}
              label={`Install ${game.title} with PlayBound Launcher`}
            />
          </div>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-bold">Installation steps</h2>
        <ol className="mt-4 space-y-4">
          {steps.map((step, i) => (
            <li
              key={i}
              id={`step-${i + 1}`}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-start gap-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  {step.platform !== "all" && (
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary uppercase">
                      <Monitor className="size-3" />
                      {PLATFORM_LABELS[step.platform] ?? step.platform}
                    </p>
                  )}
                  <p className="leading-relaxed text-muted-foreground">{step.text}</p>
                  {step.command && (
                    <pre className="mt-3 overflow-x-auto rounded-lg bg-background p-3 text-xs">
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

      <section className="mt-10">
        <h2 className="text-xl font-bold">System requirements</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Minimum
            </p>
            <p className="mt-1.5 text-sm">{game.systemRequirements.min}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Recommended
            </p>
            <p className="mt-1.5 text-sm">{game.systemRequirements.recommended}</p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">Install questions</h2>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {installFaq.map((item) => (
            <div key={item.q} className="p-4">
              <h3 className="font-semibold">{item.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-border pt-6 text-sm">
        <a
          href={game.website}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
        >
          Official {game.title} site <ExternalLink className="size-3.5" />
        </a>
        {game.githubRepo && (
          <a
            href={`https://github.com/${game.githubRepo}/releases`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            Official releases <ExternalLink className="size-3.5" />
          </a>
        )}
        {developer && (
          <Link
            href={`/developers/${developer.slug}`}
            className="font-semibold text-primary hover:underline"
          >
            More from {developer.name}
          </Link>
        )}
      </div>
    </div>
  );
}
