import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessagesSquare } from "lucide-react";
import type { Game } from "@/lib/data/types";
import type { Edition } from "@/lib/editionTypes";
import { resolveInstallAction } from "@/lib/editionInstall";
import { editionTelemetryProps } from "@/lib/editions";
import { GameArt } from "@/components/GameArt";
import { EditionInstallButton } from "./EditionInstallButton";
import {
  EditionPopulationBadge,
  EditionStatusBadge,
  EditionTypeBadge,
  VerificationBadge,
} from "./EditionBadges";
import { withOutboundUtm } from "@/lib/utm";

/**
 * One edition in the game page's Editions list.
 *
 * Larger cards with a hero band so players can compare Official vs community
 * forks (e.g. Turtle WoW) at a glance — art, population, and install actions.
 */
export function EditionCard({
  game,
  edition,
  playingNow,
}: {
  game: Game;
  edition: Edition;
  playingNow?: number;
}) {
  const action = resolveInstallAction(edition);
  const telemetryProps = editionTelemetryProps(game, edition);
  const href = `/games/${game.slug}/editions/${edition.slug}`;
  const discord = edition.links.discord;
  const heroSrc =
    edition.branding.heroImage || edition.branding.logo || game.coverImage || null;
  const remote = heroSrc ? /^https?:\/\//i.test(heroSrc) : false;

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:border-primary/40 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]">
      <div className="relative aspect-video w-full overflow-hidden bg-secondary sm:h-48 sm:aspect-auto">
        {heroSrc ? (
          <Image
            src={heroSrc}
            alt={`${game.title} — ${edition.name} edition`}
            fill
            unoptimized={remote}
            className="object-cover object-center transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        ) : (
          <GameArt game={game} showTitle={false} className="absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/20 to-transparent" />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={href}
              className="text-xl font-extrabold tracking-tight hover:underline sm:text-2xl"
            >
              {edition.name}
            </Link>
            {edition.isDefault && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase text-muted-foreground">
                Default
              </span>
            )}
          </div>
          {edition.shortDescription && (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
              {edition.shortDescription}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EditionTypeBadge edition={edition} />
          <VerificationBadge level={edition.verificationLevel} />
          <EditionStatusBadge edition={edition} />
          <EditionPopulationBadge edition={edition} population={playingNow} />
          {edition.version && (
            <span className="text-xs text-muted-foreground">v{edition.version}</span>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <EditionInstallButton action={action} telemetryProps={telemetryProps} size="md" />
          {discord && (
            <Link
              href={withOutboundUtm(discord, {
                campaign: "edition_page",
                content: edition.slug,
              })}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-secondary px-5 text-sm font-bold hover:bg-secondary/80"
            >
              <MessagesSquare className="size-4" />
              Community
            </Link>
          )}
          <Link
            href={href}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-secondary px-5 text-sm font-bold hover:bg-secondary/80"
          >
            Details <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
