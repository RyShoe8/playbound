import Link from "next/link";
import { ExternalLink, Monitor, Terminal } from "lucide-react";
import type { Game } from "@/lib/data/types";
import { getDeveloper } from "@/lib/developers";
import { isLauncherInstallable } from "@/lib/launcher";
import { sizeLabel } from "@/lib/seo";
import { DeviceAwareInstallCta } from "@/components/DeviceAwareInstallCta";
import { TelemetryAnchor } from "@/components/TelemetryAnchor";
import { deriveInstallSteps, deriveFaq } from "@/lib/enrich";
import { withOutboundUtm } from "@/lib/utm";

const PLATFORM_LABELS: Record<string, string> = {
  all: "All platforms",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

/** Install guide body for the game hub Install tab (no page chrome). */
export async function GameInstallContent({ game }: { game: Game }) {
  const developer = await getDeveloper(game.developerSlug);
  const steps = game.installSteps?.length ? game.installSteps : deriveInstallSteps(game);
  const oneClick = isLauncherInstallable(game);
  const installFaq = game.faq?.length ? game.faq : deriveFaq(game);
  const websiteHref = withOutboundUtm(game.website, {
    campaign: "game_install",
    content: game.slug,
  });
  const releasesHref = game.githubRepo
    ? withOutboundUtm(`https://github.com/${game.githubRepo}/releases`, {
        campaign: "game_install",
        content: game.slug,
      })
    : null;

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
            ? "On a computer, the fastest route is the PlayBound Launcher. On a phone or tablet, use the official store or site instead."
            : `Download it from the official site at ${game.website}.`}
        </p>
      </div>

      <DeviceAwareInstallCta game={game} oneClick={oneClick} />

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
          href={websiteHref}
          target="_blank"
          rel="noreferrer"
          event="official_download_clicked"
          properties={{ gameSlug: game.slug, url: websiteHref }}
          className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
        >
          Official {game.title} site <ExternalLink className="size-3.5" />
        </TelemetryAnchor>
        {releasesHref && (
          <TelemetryAnchor
            href={releasesHref}
            target="_blank"
            rel="noreferrer"
            event="official_download_clicked"
            properties={{
              gameSlug: game.slug,
              url: releasesHref,
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
