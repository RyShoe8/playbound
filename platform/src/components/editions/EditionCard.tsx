import Link from "next/link";
import { ArrowRight, MessagesSquare } from "lucide-react";
import type { Game } from "@/lib/data/types";
import type { Edition } from "@/lib/editionTypes";
import { resolveInstallAction } from "@/lib/editionInstall";
import { editionTelemetryProps } from "@/lib/editions";
import { EditionInstallButton } from "./EditionInstallButton";
import {
  EditionPopulationBadge,
  EditionStatusBadge,
  EditionTypeBadge,
  VerificationBadge,
} from "./EditionBadges";

/**
 * One edition in the game page's Editions list.
 *
 * Carries type, certification, population, a short description and both the
 * install and community actions — enough to choose between "Official" and
 * "Turtle WoW" without opening either.
 */
export function EditionCard({ game, edition }: { game: Game; edition: Edition }) {
  const action = resolveInstallAction(edition);
  const telemetryProps = editionTelemetryProps(game, edition);
  const href = `/games/${game.slug}/editions/${edition.slug}`;
  const discord = edition.links.discord;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href} className="text-lg font-extrabold tracking-tight hover:underline">
              {edition.name}
            </Link>
            {edition.isDefault && (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase text-muted-foreground">
                Default
              </span>
            )}
          </div>
          {edition.shortDescription && (
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
              {edition.shortDescription}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EditionTypeBadge edition={edition} />
        <VerificationBadge level={edition.verificationLevel} />
        <EditionStatusBadge edition={edition} />
        <EditionPopulationBadge edition={edition} />
        {edition.version && (
          <span className="text-xs text-muted-foreground">v{edition.version}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EditionInstallButton action={action} telemetryProps={telemetryProps} size="sm" />
        {discord && (
          <Link
            href={discord}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary px-4 text-sm font-bold hover:bg-secondary/80"
          >
            <MessagesSquare className="size-4" />
            Community
          </Link>
        )}
        <Link
          href={href}
          className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-primary hover:underline"
        >
          Details <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
