"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, HardDriveDownload } from "lucide-react";
import type { InstallAction } from "@/lib/editionInstall";
import { telemetry } from "@/lib/telemetry";
import { usePartyStore } from "@/stores/partyStore";

type EditionOption = {
  slug: string;
  name: string;
  installAction: InstallAction;
};

/**
 * Edition install list for a party leader who picked a game they do not have.
 * Shown under the game dropdown immediately — sync is only used to hide it
 * once their library reports the game.
 */
export function PartyHostInstallPicker({
  partyId,
  gameSlug,
  editionSlug,
}: {
  partyId: string;
  gameSlug: string;
  editionSlug?: string | null;
}) {
  const setEdition = usePartyStore((s) => s.setEdition);
  const [editions, setEditions] = useState<EditionOption[] | null>(null);
  const [hostHasGame, setHostHasGame] = useState<boolean | null>(null);

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
        setEditions(
          (data.editions || []).map(
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
  }, [gameSlug]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`/api/parties/${partyId}/sync`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const host = (data.sync?.members || []).find(
          (m: { isHost?: boolean }) => m.isHost
        );
        setHostHasGame(Boolean(host?.hasGame) || data.sync?.referenceSource === "host");
      } catch (err) {
        console.error("Failed to check host install for party picker", err);
      }
    }
    setHostHasGame(null);
    void check();
    const timer = setInterval(() => void check(), 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [partyId, gameSlug, editionSlug]);

  if (hostHasGame) return null;

  if (editions === null) {
    return <div className="mt-2 h-16 max-w-md animate-pulse rounded-lg border border-border bg-secondary/40" />;
  }

  if (editions.length === 0) return null;

  return (
    <div className="mt-2 max-w-md space-y-2">
      <p className="text-xs text-muted-foreground">
        You don&apos;t have this installed yet. Pick a version for the party — then everyone
        else can match it.
      </p>
      <ul className="space-y-2">
        {editions.map((edition) => {
          const action = edition.installAction;
          const href = action.href;
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
                    void setEdition(partyId, edition.slug);
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
                    void setEdition(partyId, edition.slug);
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
