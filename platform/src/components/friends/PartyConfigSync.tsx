"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Download, HardDriveDownload } from "lucide-react";
import type { ConfigSyncMember } from "@/lib/playTogether/types";
import { usePartyStore } from "@/stores/partyStore";
import { telemetry } from "@/lib/telemetry";
import { PartyHostInstallPicker } from "@/components/friends/PartyHostInstallPicker";

const BASE_EDITION_KEY = "__base__";

/**
 * Deep link that makes the launcher install exactly what the host is running.
 *
 * Mods ride along as repeated ?mod= params; the launcher ignores parameters it
 * does not understand, so an older build still performs the game/edition
 * install rather than failing the whole hand-off.
 */
function installHref(gameSlug: string, editionSlug: string | null, mods: string[]): string {
  const q = new URLSearchParams();
  if (editionSlug && editionSlug !== BASE_EDITION_KEY) q.set("edition", editionSlug);
  for (const mod of mods) q.append("mod", mod);
  q.set("return", "friends");
  return `playbound://install/${gameSlug}?${q.toString()}`;
}

function usableEditionSlug(slug: string | null | undefined): string | null {
  if (!slug || slug === BASE_EDITION_KEY) return null;
  return slug;
}

/** What this member is short of, in words a player would use. */
function missingSummary(m: ConfigSyncMember, editionSlug: string | null): string[] {
  const out: string[] = [];
  if (!m.hasGame) out.push("the game");
  else if (editionSlug && !m.hasEdition) out.push("a different edition");
  if (m.missingMods.length > 0) {
    out.push(`${m.missingMods.length} mod${m.missingMods.length === 1 ? "" : "s"}`);
  }
  return out;
}

export function PartyConfigSync({
  partyId,
  gameSlug,
  editionSlug,
  currentUserId,
}: {
  partyId: string;
  gameSlug: string;
  /** Refetch immediately when the host picks (or clears) an edition. */
  editionSlug?: string | null;
  /** Lets the viewer's own row offer the install button rather than a name. */
  currentUserId?: string | null;
}) {
  const storeSync = usePartyStore((s) =>
    s.activeParty?.id === partyId ? s.activeParty.configSync : undefined
  );
  const readiness = usePartyStore((s) =>
    s.activeParty?.id === partyId ? s.activeParty.readiness : undefined
  );
  const sync = storeSync ?? null;
  const fetchParties = usePartyStore((s) => s.fetchParties);

  useEffect(() => {
    telemetry.track("party_config_sync_viewed", { partyId, gameSlug });
    void fetchParties();
  }, [partyId, gameSlug, editionSlug, fetchParties]);

  /*
   * No pulse of its own.
   *
   * This used to poll every 1.5s while members were still installing, on top
   * of the store's own 1s lobby poll — two uncoordinated timers hitting
   * /api/parties for the same payload, so a party that was not yet in sync
   * asked for it about 1.7 times a second and got the same answer twice. The
   * store already runs at its fast interval for exactly this situation
   * (activeParty, not ended, viewer not in-game); the panel reads the sync
   * block that poll brings back.
   */

  if (!sync) {
    return <div className="h-16 animate-pulse rounded-lg border border-border bg-card" />;
  }

  const isYouHost = Boolean(currentUserId) && sync.hostUserId === currentUserId;

  if (sync.allInSync) {
    /*
     * Headline comes from the server so this panel and the launcher's say the
     * same thing. It deliberately distinguishes "everyone has the files" from
     * "everyone pressed Ready Up" — rendering the former as "everyone is ready"
     * is what put a green banner above a member list reading "Not ready".
     */
    const headline = readiness?.headline ?? "Everyone has the right version";
    const matchText =
      sync.referenceSource === "host"
        ? isYouHost
          ? "Every member matches your setup."
          : sync.hostUsername
          ? `Every member matches ${sync.hostUsername}'s setup.`
          : "All members have the required game and editions installed."
        : "All members have the required game and editions installed.";

    /*
     * A status line, not a banner. At full card padding this was the largest
     * thing in the party header — a green block announcing that nothing is
     * wrong, above the controls that actually need the room.
     */
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2.5 text-green-700 dark:text-green-400">
        <CheckCircle2 className="mt-px size-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold">{headline}</p>
          <p className="text-xs opacity-90">{matchText}</p>
          {readiness?.phase === "waiting_ready" && (
            <p className="text-xs opacity-90">{readiness.detail}</p>
          )}
        </div>
      </div>
    );
  }

  const hostMember = sync.members.find((m) => m.isHost);
  const hostHasGame =
    Boolean(hostMember?.hasGame) || sync.referenceSource === "host";

  const outOfSync = sync.members.filter((m) => {
    return missingSummary(m, sync.editionSlug).length > 0;
  });
  if (outOfSync.length === 0) return null;

  const installEdition =
    usableEditionSlug(sync.editionSlug) ||
    usableEditionSlug(editionSlug) ||
    usableEditionSlug(hostMember?.installedEditionSlug);
  const href = installHref(gameSlug, installEdition, sync.modSlugs);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-destructive/10 px-3 py-2">
        <AlertCircle className="size-4 text-destructive" />
        <h4 className="text-xs font-bold text-destructive">Not everyone can play yet</h4>
      </div>

      <div className="p-3">
        <p className="mb-3 text-xs text-muted-foreground">
          {hostHasGame ? (
            isYouHost ? (
              <>
                This party is playing your setup. Anyone who doesn&apos;t have it yet can
                install it from their own party panel.
              </>
            ) : sync.hostUsername ? (
              <>
                This party is playing {sync.hostUsername}&apos;s setup. Anyone who doesn&apos;t
                have it yet can install it from their own party panel.
              </>
            ) : (
              <>
                Some members are missing files this party needs. They won&apos;t be able to
                launch with the party until they install them.
              </>
            )
          ) : (
            <>
              Some members are missing files this party needs. They won&apos;t be able to
              launch with the party until they install them.
            </>
          )}
        </p>

        <ul className="space-y-2.5">
          {outOfSync.map((m) => {
            const missing = missingSummary(m, sync.editionSlug);
            const isYou = Boolean(currentUserId) && m.userId === currentUserId;
            const showInstall = isYou;

            return (
              <li
                key={m.userId}
                className="flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                    {m.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-semibold">{isYou ? "You" : m.username}</span>
                  <span className="truncate text-muted-foreground">
                    {isYou
                      ? `need ${missing.join(" and ")}`
                      : `needs ${missing.join(" and ")} — they can install it from their party panel`}
                  </span>
                </div>

                {showInstall && !m.hasGame && sync.referenceSource === "party" && !installEdition ? (
                  /*
                   * Nobody has established a version yet, so there is nothing to
                   * match — show the actual multiplayer editions rather than a
                   * single "install the right version" link that cannot know
                   * which one is right.
                   */
                  <PartyHostInstallPicker
                    partyId={partyId}
                    gameSlug={gameSlug}
                    editionSlug={editionSlug}
                    canSetEdition={isYouHost}
                    viewerMissingGame
                  />
                ) : showInstall ? (
                  <a
                    href={href}
                    onClick={() =>
                      telemetry.track("party_config_sync_install_clicked", {
                        partyId,
                        gameSlug,
                        editionSlug: installEdition,
                        modCount: sync.modSlugs.length,
                      })
                    }
                    className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
                  >
                    <Download className="size-3" />{" "}
                    {sync.editionName
                      ? `Install ${sync.editionName}`
                      : installEdition
                      ? "Install required edition"
                      : "Install the game"}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>

        {outOfSync.some((m) => Boolean(currentUserId) && m.userId === currentUserId) && (
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            Nothing happened?{" "}
            <Link
              href="/launcher"
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <HardDriveDownload className="size-3" /> Get the PlayBound launcher
            </Link>{" "}
            — it&apos;s what installs the matching version for you.
          </p>
        )}
      </div>
    </div>
  );
}
