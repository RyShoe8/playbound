import Link from "next/link";
import type { GameCommunityLinks } from "@/lib/data/types";

export function CommunityCard({
  gameSlug,
  gameTitle,
  communityLinks,
  compact,
  presence,
}: {
  gameSlug: string;
  gameTitle: string;
  communityLinks?: GameCommunityLinks | null;
  compact?: boolean;
  presence?: { online?: number; members?: number } | null;
}) {
  const official = communityLinks?.officialDiscord;
  const playbound = communityLinks?.playboundDiscord;
  const showOfficial = official?.verified && official.inviteUrl;

  return (
    <div
      className={
        compact
          ? "flex flex-wrap gap-2"
          : "space-y-3 rounded-xl border border-border bg-card p-4"
      }
    >
      {!compact && (
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Community
        </p>
      )}

      {showOfficial ? (
        <a
          href={official!.inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            compact
              ? "rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold hover:bg-secondary/70"
              : "block rounded-lg border border-border bg-secondary/40 p-3 transition-colors hover:border-primary/40"
          }
        >
          {compact ? (
            "Official Discord ↗"
          ) : (
            <>
              <p className="font-semibold">Official Discord</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Talk directly with the {official!.serverName || gameTitle} community.
              </p>
              <p className="mt-2 text-sm font-semibold text-primary">Join Official Discord ↗</p>
            </>
          )}
        </a>
      ) : !compact ? (
        <div className="rounded-lg border border-dashed border-border p-3 text-sm">
          <p className="font-semibold">Official Discord</p>
          <p className="mt-1 text-muted-foreground">
            No verified official Discord has been submitted.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Developers can contact PlayBound to verify an official community link.
          </p>
        </div>
      ) : null}

      {playbound?.inviteUrl ? (
        <a
          href={playbound.inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={
            compact
              ? "rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold hover:bg-secondary/70"
              : "block rounded-lg border border-border bg-secondary/40 p-3 transition-colors hover:border-primary/40"
          }
        >
          {compact ? (
            `Join #${playbound.channelName || gameSlug} ↗`
          ) : (
            <>
              <p className="font-semibold">PlayBound Discord</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Chat with PlayBound players in #{playbound.channelName || gameSlug}.
              </p>
              {(presence?.members != null || presence?.online != null) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {presence.members != null ? `${presence.members.toLocaleString()} members` : null}
                  {presence.members != null && presence.online != null ? " · " : null}
                  {presence.online != null ? `${presence.online.toLocaleString()} online` : null}
                </p>
              )}
              <p className="mt-2 text-sm font-semibold text-primary">
                Join #{playbound.channelName || gameSlug} ↗
              </p>
            </>
          )}
        </a>
      ) : null}

      {!compact && (
        <p className="text-xs text-muted-foreground">
          Solved this in Discord?{" "}
          <Link
            href={`/games/${gameSlug}?tab=discussion`}
            className="font-semibold text-primary hover:underline"
          >
            Post the fix here
          </Link>{" "}
          so the next player can find it.
        </p>
      )}
    </div>
  );
}
