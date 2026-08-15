import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { Game } from "@/lib/data/types";

/**
 * Says whether this game's one-click install was working the last time we
 * actually tried it.
 *
 * The whole promise of PlayBound is "click once and it works", and every
 * install points at an upstream that can move without warning — so the honest
 * thing is to check on a schedule and show the result rather than let a player
 * discover a dead download for us.
 *
 * Reads the same versionCheckStatus the /api/cron/catalog-versions probe
 * writes and admin/version-issues lists, so players and admins are never
 * looking at two different opinions of the same install.
 */

/** Past this, a pass is too old to stand behind and we say nothing. */
const STALE_AFTER_HOURS = 24 * 4;

function verifiedLabel(checkedAt: Date, now = new Date()): string | null {
  const hours = (now.getTime() - checkedAt.getTime()) / 36e5;
  if (Number.isNaN(hours) || hours < 0 || hours > STALE_AFTER_HOURS) return null;
  if (hours < 1) return "Verified working just now";
  if (hours < 2) return "Verified working 1 hour ago";
  if (hours < 24) return `Verified working ${Math.floor(hours)} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Verified working yesterday" : `Verified working ${days} days ago`;
}

export function InstallHealthNotice({ game }: { game: Game }) {
  const install = game.launcherInstall;
  if (!install) return null;

  if (install.versionCheckStatus === "broken") {
    return (
      <div
        role="status"
        className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium text-amber-200">One-click install is temporarily unavailable</p>
          <p className="text-amber-200/80">
            The download this game points at stopped responding on our last check, so we&rsquo;ve
            hidden the install button rather than send you to a dead file. The links below still
            work.
          </p>
          {install.versionCheckNote ? (
            <p className="mt-1 break-words font-mono text-xs text-amber-200/60">
              {install.versionCheckNote}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  // Anything other than a recent, explicit pass stays quiet. "skipped" in
  // particular means the probe could not reach an answer — claiming verified
  // off that is the unearned promise this whole feature exists to avoid.
  if (install.versionCheckStatus !== "ok" && install.versionCheckStatus !== "updated") return null;
  if (!install.lastVersionCheckAt) return null;

  const checkedAt = new Date(install.lastVersionCheckAt);
  if (Number.isNaN(checkedAt.getTime())) return null;

  const label = verifiedLabel(checkedAt);
  if (!label) return null;

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="size-3.5 text-emerald-500" aria-hidden />
      {label}
    </p>
  );
}
