import Link from "next/link";
import { Download, ExternalLink, Monitor, Terminal } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { developersBySlug } from "@/lib/catalog";
import { isLauncherInstallable } from "@/lib/launcher";
import { sizeLabel } from "@/lib/seo";
import { LauncherInstallButton } from "@/components/LauncherInstallButton";
import { TelemetryAnchor } from "@/components/TelemetryAnchor";
import { deriveInstallSteps, deriveFaq } from "@/lib/enrich";

const PLATFORM_LABELS: Record<string, string> = {
  all: "All platforms",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

/** Install guide body for the game hub Install tab (no page chrome). */
export function GameInstallContent({ game }: { game: Game }) {
  const developer = developersBySlug.get(game.developerSlug);
  const steps = game.installSteps?.length ? game.installSteps : deriveInstallSteps(game);
  const oneClick = isLauncherInstallable(game);
  const installFaq = game.faq?.length ? game.faq : deriveFaq(game);

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          How to install {game.title} for free
        </h2>
        <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
          {game.title} is a free {game.genres[0]?.toLowerCase()} game released under{" "}
          {game.license}. It runs on {game.platforms.join(", ")}, needs about{" "}
          {sizeLabel(game.sizeMB)} of disk space, and requires no account, payment or trial.{" "}
          {oneClick
            ? "The fastest route is the PlayBound Launcher, which handles the download and setup in one click."
            : `Download it from the official site at ${game.website}.`}
        </p>
      </div>

      {oneClick && (
        <div className="rounded-xl border border-border bg-card p-5">
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

      <section>
        <h3 className="text-xl font-bold">Installation steps</h3>
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
                  <p className="leading-relaxed break-words text-muted-foreground">{step.text}</p>
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

      <section>
        <h3 className="text-xl font-bold">System requirements</h3>
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

      <section>
        <h3 className="text-xl font-bold">Install questions</h3>
        <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
          {installFaq.map((item) => (
            <div key={item.q} className="p-4">
              <h4 className="font-semibold">{item.q}</h4>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-border pt-6 text-sm">
        <TelemetryAnchor
          href={game.website}
          target="_blank"
          rel="noreferrer"
          event="official_download_clicked"
          properties={{ gameSlug: game.slug, url: game.website }}
          className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
        >
          Official {game.title} site <ExternalLink className="size-3.5" />
        </TelemetryAnchor>
        {game.githubRepo && (
          <TelemetryAnchor
            href={`https://github.com/${game.githubRepo}/releases`}
            target="_blank"
            rel="noreferrer"
            event="official_download_clicked"
            properties={{
              gameSlug: game.slug,
              url: `https://github.com/${game.githubRepo}/releases`,
            }}
            className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
          >
            Official releases <ExternalLink className="size-3.5" />
          </TelemetryAnchor>
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
