import { AlertTriangle, ShieldCheck } from "lucide-react";
import { isGameInstallBroken, verifiedLabel, brokenDetail } from "@/lib/recipeHealth";

/**
 * Says whether this game's one-click install was working the last time we
 * actually tried it.
 *
 * The whole promise of PlayBound is "click once and it works", and every
 * install points at an upstream that can move without warning — so the honest
 * thing is to check on a schedule and show the result rather than let a player
 * discover a dead download for us. When a recipe is known broken we say so up
 * front instead of letting them click into the failure.
 *
 * Renders nothing when the last check is too old to stand behind; an unearned
 * "verified" badge is worse than no badge.
 */
export function InstallHealthNotice({ slug }: { slug: string }) {
  const broken = isGameInstallBroken(slug);

  if (broken) {
    const detail = brokenDetail(`game:${slug}`);
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
          {detail ? (
            <p className="mt-1 break-words font-mono text-xs text-amber-200/60">{detail}</p>
          ) : null}
        </div>
      </div>
    );
  }

  const label = verifiedLabel();
  if (!label) return null;

  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck className="size-3.5 text-emerald-500" aria-hidden />
      {label}
    </p>
  );
}
