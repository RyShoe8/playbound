import { Users2 } from "lucide-react";
import { WINDOW_LABELS, type FailureWindow, type Tally } from "@/lib/admin/failureRates";
import type { PartyHealth } from "@/lib/admin/partyHealth";

const WINDOWS: FailureWindow[] = ["d1", "d7", "d30"];

const AREA_LABELS: Record<string, string> = {
  discord: "Discord",
  sync: "Config sync",
  host: "Game host",
  lan: "Virtual LAN",
  chat: "Chat",
  launch: "Launch",
  membership: "Membership",
  unknown: "Other",
};

function formatRate(tally: Tally): string {
  if (tally.rate === null) return "—";
  return `${tally.rate < 10 ? tally.rate.toFixed(1) : Math.round(tally.rate)}%`;
}

function rateTone(tally: Tally): string {
  if (tally.rate === null) return "text-muted-foreground";
  if (tally.rate >= 10) return "text-red-500";
  if (tally.rate >= 5) return "text-amber-500";
  return "text-emerald-500";
}

/**
 * Party failures on the Ops console.
 *
 * Sits beside the install/launch card and reads the same way on purpose — one
 * scan of the top of the page should answer "is anything broken", and two cards
 * with different conventions makes that harder than it needs to be.
 */
export function PartyHealthCard({
  health,
  gameSlug,
}: {
  health: PartyHealth;
  gameSlug?: string;
}) {
  const anyData = WINDOWS.some((w) => health[w].overall.rate !== null);
  const scope = gameSlug ? gameSlug : "all games";
  // The 24h breakdown is the actionable one — it says what is failing now.
  const areas = health.d1.byArea.length > 0 ? health.d1.byArea : health.d7.byArea;

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Users2 className="size-4 text-primary" /> Party failures
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {scope}
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Discord channels, config sync, hosting and virtual LAN.
          </p>
        </div>
      </div>

      {anyData ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-4">
            {WINDOWS.map((w) => {
              const t = health[w].overall;
              return (
                <div key={w}>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {WINDOW_LABELS[w]}
                  </p>
                  <div className="mt-1 flex flex-col leading-tight">
                    <span className={`text-xl font-extrabold ${rateTone(t)}`}>
                      {formatRate(t)}
                    </span>
                    {t.failed + t.completed > 0 ? (
                      <span className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">
                        <span className="font-semibold text-red-500">{t.failed}</span> failed
                        <span className="mx-1">·</span>
                        <span className="font-semibold text-emerald-500">{t.completed}</span> ok
                      </span>
                    ) : (
                      <span className="mt-0.5 text-xs text-muted-foreground">no attempts</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {areas.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              {/* What is failing, not just how much — "12 failures" is noise,
                  "12, all Discord" points at the bot. */}
              <p className="text-xs font-semibold text-muted-foreground">
                Failing {health.d1.byArea.length > 0 ? "in the last 24h" : "in the last 7d"}
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {areas.map((a) => (
                  <li
                    key={a.area}
                    className="rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs"
                  >
                    <span className="font-semibold">{AREA_LABELS[a.area] ?? a.area}</span>
                    <span className="ml-1.5 font-bold text-red-500">{a.failed}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          No party activity in the last 30 days.
        </p>
      )}
    </section>
  );
}
