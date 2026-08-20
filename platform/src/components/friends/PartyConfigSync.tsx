"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Download, HardDriveDownload } from "lucide-react";
import type { ConfigSyncMember } from "@/lib/playTogether/types";
import { usePartyStore } from "@/stores/partyStore";
import { telemetry } from "@/lib/telemetry";

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
  const qs = q.toString();
  return `playbound://install/${gameSlug}${qs ? `?${qs}` : ""}`;
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

  // Fast pulse check while party members are syncing or installing
  useEffect(() => {
    if (sync?.allInSync) return;
    const interval = setInterval(() => {
      void fetchParties();
    }, 1500);
    return () => clearInterval(interval);
  }, [sync?.allInSync, fetchParties]);

  if (!sync) {
    return <div className="h-24 animate-pulse rounded-xl border border-border bg-card p-4" />;
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

    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-green-500/10 p-4 text-green-700 dark:text-green-400">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
        <div>
          <h4 className="text-sm font-bold">{headline}</h4>
          <p className="mt-1 text-xs opacity-90">{matchText}</p>
          {readiness?.phase === "waiting_ready" && (
            <p className="mt-1 text-xs opacity-90">{readiness.detail}</p>
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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-destructive/10 p-3">
        <AlertCircle className="size-4 text-destructive" />
        <h4 className="text-sm font-bold text-destructive">Not everyone can play yet</h4>
      </div>

      <div className="p-4">
        <p className="mb-4 text-sm text-muted-foreground">
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

        <ul className="space-y-3">
          {outOfSync.map((m) => {
            const missing = missingSummary(m, sync.editionSlug);
            const isYou = Boolean(currentUserId) && m.userId === currentUserId;
            const showInstall = isYou;

            return (
              <li
                key={m.userId}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
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

                {showInstall && (
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
                    <Download className="size-3" /> Install the right version
                  </a>
                )}
              </li>
            );
          })}
        </ul>

        {outOfSync.some((m) => Boolean(currentUserId) && m.userId === currentUserId) && (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
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
