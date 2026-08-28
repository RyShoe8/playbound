"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, HardDriveDownload } from "lucide-react";
import type { InstallAction } from "@/lib/editionInstall";
import { telemetry } from "@/lib/telemetry";
import { usePartyStore } from "@/stores/partyStore";

import { editionSupportsPartyPlay } from "@/lib/multiplayer/support";

function withPartyInstallReturn(href: string): string {
  if (!href.startsWith("playbound://install/")) return href;
  if (/[?&]return=friends(?:&|$)/.test(href)) return href;
  return `${href}${href.includes("?") ? "&" : "?"}return=friends`;
}

type EditionOption = {
  slug: string;
  name: string;
  installAction: InstallAction;
};

/**
 * Edition install list for someone in the party who does not have the game.
 *
 * Only party-playable editions (Multiplayer / Co-op features). A Freedoom host
 * must not be offered GZDoom or DSDA — those cannot join a PlayBound party.
 *
 * When the party already locked an edition (setPartyGame picks Zandronum), show
 * that one install instead of a multi-choice picker.
 */
export function PartyHostInstallPicker({
  partyId,
  gameSlug,
  editionSlug,
  canSetEdition = true,
  viewerMissingGame,
}: {
  partyId: string;
  gameSlug: string;
  editionSlug?: string | null;
  /** Only the leader's pick becomes the party's version. */
  canSetEdition?: boolean;
  /**
   * Render for a non-leader who lacks the game. When omitted the component
   * keeps its original behaviour and keys off the host's install.
   */
  viewerMissingGame?: boolean;
}) {
  const setEdition = usePartyStore((s) => s.setEdition);
  const [editions, setEditions] = useState<EditionOption[] | null>(null);
  const [hostHasGame, setHostHasGame] = useState<boolean | null>(null);

  const storeSync = usePartyStore((s) =>
    s.activeParty?.id === partyId ? s.activeParty.configSync : undefined
  );
  const storeHostMember = storeSync?.members?.find((m) => m.isHost);
  const storeHostHasGame =
    Boolean(storeHostMember?.hasGame) || Boolean(storeSync?.allInSync) || storeSync?.referenceSource === "host";
  const lockedEdition =
    (editionSlug && editionSlug !== "__base__" ? editionSlug : null) ||
    (storeSync?.editionSlug && storeSync.editionSlug !== "__base__" ? storeSync.editionSlug : null);

  useEffect(() => {
    let cancelled = false;
    async function loadEditions() {
      try {
        const res = await fetch(`/api/games/${encodeURIComponent(gameSlug)}/editions`);
        if (cancelled) return;
        if (!res.ok) {
          setEditions([]);
          return;
        }
        const data = await res.json();
        const rawEditions = Array.isArray(data.editions) ? data.editions : [];
        const partyEditions = rawEditions.filter((ed: Record<string, unknown>) =>
          editionSupportsPartyPlay(ed as unknown as Parameters<typeof editionSupportsPartyPlay>[0])
        );
        /*
         * Prefer party-playable editions. If the catalog has none tagged yet,
         * fall back to the full list rather than showing an empty picker — but
         * never prefer a known SP list when Multiplayer editions exist.
         */
        let listToDisplay = partyEditions.length > 0 ? partyEditions : rawEditions;
        if (lockedEdition) {
          const locked = listToDisplay.find(
            (ed: { slug: string }) => ed.slug === lockedEdition
          );
          if (locked) listToDisplay = [locked];
          else if (partyEditions.length === 0) {
            const fromAll = rawEditions.find(
              (ed: { slug: string }) => ed.slug === lockedEdition
            );
            if (fromAll) listToDisplay = [fromAll];
          }
        }
        setEditions(
          listToDisplay.map(
            (edition: { slug: string; name: string; installAction: InstallAction }) => ({
              slug: edition.slug,
              name: edition.name,
              installAction: edition.installAction,
            })
          )
        );
      } catch (err) {
        console.error("Failed to load editions for party picker", err);
        if (!cancelled) setEditions([]);
      }
    }
    setEditions(null);
    void loadEditions();
    return () => {
      cancelled = true;
    };
  }, [gameSlug, lockedEdition]);

  /*
   * The party payload already carries config-sync, and the panel polls it
   * every second. Asking /sync for the same thing every 4s was a second
   * request per viewer computing the identical read cluster — so the endpoint
   * is only used when this renders somewhere the store has no party to read,
   * and the store's own value drives the common case.
   */
  const hasStoreSync = storeSync !== undefined;

  useEffect(() => {
    if (hasStoreSync) return;
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`/api/parties/${partyId}/sync`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const host = (data.sync?.members || []).find(
          (m: { isHost?: boolean }) => m.isHost
        );
        setHostHasGame(
          Boolean(host?.hasGame) ||
            Boolean(data.sync?.allInSync) ||
            data.sync?.referenceSource === "host"
        );
      } catch (err) {
        console.error("Failed to check host install for party picker", err);
      }
    }
    setHostHasGame(null);
    void check();
    const timer = setInterval(() => void check(), 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [partyId, gameSlug, editionSlug, hasStoreSync]);

  /*
   * A member asked to render explicitly shows the list whenever they are
   * missing the game — the host having it is what gives the party a reference,
   * not a reason to hide the versions from someone who still has to install.
   */
  if (viewerMissingGame === undefined) {
    if (storeHostHasGame || hostHasGame) return null;
  } else if (!viewerMissingGame) {
    return null;
  }

  if (editions === null) {
    return <div className="mt-2 h-16 max-w-md animate-pulse rounded-lg border border-border bg-secondary/40" />;
  }

  if (editions.length === 0) return null;

  const singleLocked = Boolean(lockedEdition) && editions.length === 1;

  return (
    <div className="mt-2 max-w-md space-y-2">
      <p className="text-xs text-muted-foreground">
        {singleLocked
          ? canSetEdition
            ? `You don't have this installed yet. Install ${editions[0].name} so the party can play together.`
            : `You don't have this installed yet. Install ${editions[0].name} to match the party.`
          : canSetEdition
          ? "You don't have this installed yet. Pick a multiplayer version for the party — then everyone else can match it."
          : "You don't have this installed yet. Install the multiplayer version to join in."}
      </p>
      <ul className="space-y-2">
        {editions.map((edition) => {
          const action = edition.installAction;
          const href = action.href ? withPartyInstallReturn(action.href) : null;
          const opensNewTab =
            action.kind === "browser" || Boolean(action.kind === "link" && action.external);
          return (
            <li
              key={edition.slug}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
            >
              <span className="text-sm font-semibold">{edition.name}</span>
              {action.unavailableReason ? (
                <span className="text-xs text-muted-foreground">{action.unavailableReason}</span>
              ) : href ? (
                <a
                  href={href}
                  target={opensNewTab ? "_blank" : undefined}
                  rel={opensNewTab ? "noopener noreferrer" : undefined}
                  onClick={() => {
                    if (canSetEdition) void setEdition(partyId, edition.slug);
                    telemetry.track("party_config_sync_edition_picked", {
                      partyId,
                      gameSlug,
                      editionSlug: edition.slug,
                    });
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
                >
                  <Download className="size-3" />
                  {action.label || "Install"}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (canSetEdition) void setEdition(partyId, edition.slug);
                    telemetry.track("party_config_sync_edition_picked", {
                      partyId,
                      gameSlug,
                      editionSlug: edition.slug,
                    });
                  }}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
                >
                  <Download className="size-3" />
                  {action.label || "Use this version"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Nothing happened?{" "}
        <Link
          href="/launcher"
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        >
          <HardDriveDownload className="size-3" /> Get the PlayBound launcher
        </Link>
      </p>
    </div>
  );
}
