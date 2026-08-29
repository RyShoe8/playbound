"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Layers,
  Minus,
} from "lucide-react";
import {
  WINDOW_LABELS,
  type FailureRates,
  type FailureWindow,
  type Tally,
} from "@/lib/admin/failureRates";

const WINDOWS: FailureWindow[] = ["d1", "d7", "d30"];

function formatRate(tally: Tally): string {
  if (tally.rate === null) return "—";
  // Sub-1% still matters at scale, so keep a decimal rather than rounding a
  // real failure rate down to 0%.
  return `${tally.rate < 10 ? tally.rate.toFixed(1) : Math.round(tally.rate)}%`;
}

function rateTone(tally: Tally): string {
  if (tally.rate === null) return "text-muted-foreground";
  if (tally.rate >= 10) return "text-red-500";
  if (tally.rate >= 5) return "text-amber-500";
  return "text-emerald-500";
}

/**
 * How 24h compares with the 30-day baseline.
 *
 * Rising failure is the thing worth noticing, so the arrow points at the
 * direction of the rate and the colour reads it as good or bad — up is red
 * here, which is the opposite of most trend indicators.
 */
function Trend({ current, baseline }: { current: Tally; baseline: Tally }) {
  if (current.rate === null || baseline.rate === null) return null;
  const delta = current.rate - baseline.rate;
  // Under a fifth of a point is noise on small volumes, not a trend.
  if (Math.abs(delta) < 0.2) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground">
        <Minus className="size-3" /> flat vs 30d
      </span>
    );
  }
  const worse = delta > 0;
  const Icon = worse ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        worse ? "text-red-500" : "text-emerald-500"
      }`}
    >
      <Icon className="size-3" />
      {`${worse ? "+" : ""}${delta.toFixed(1)} pts vs 30d`}
    </span>
  );
}

function MetricSection({
  label,
  pick,
  pickPlatform,
  rates,
  emphasis,
  expanded,
  onToggle,
}: {
  label: string;
  pick: (w: FailureWindow) => Tally;
  pickPlatform: (w: FailureWindow, platform: string) => Tally | undefined;
  rates: FailureRates;
  emphasis?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const platforms = rates.platforms || [];
  const activePlatforms = platforms.filter((p) =>
    WINDOWS.some((w) => {
      const t = pickPlatform(w, p);
      return t && t.failed + t.completed > 0;
    })
  );

  return (
    <>
      <tr className={emphasis ? "border-b border-border/80" : "border-t border-border/40"}>
        <th
          scope="row"
          className={`py-2.5 pr-4 text-left align-middle ${
            emphasis ? "text-sm font-bold text-foreground" : "text-sm font-semibold text-foreground/90"
          }`}
        >
          <div className="flex items-center gap-2">
            {activePlatforms.length > 0 && onToggle ? (
              <button
                type="button"
                onClick={onToggle}
                className="inline-flex items-center gap-1 text-left font-inherit hover:text-primary transition-colors cursor-pointer"
                title={expanded ? "Collapse platform breakdown" : "Expand platform breakdown"}
              >
                {expanded ? (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
                <span>{label}</span>
              </button>
            ) : (
              <span>{label}</span>
            )}
            {activePlatforms.length > 0 && (
              <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {activePlatforms.length} {activePlatforms.length === 1 ? "platform" : "platforms"}
              </span>
            )}
          </div>
        </th>
        {WINDOWS.map((w) => {
          const tally = pick(w);
          return (
            <td key={w} className="py-2.5 pr-4 align-middle">
              <div className="flex flex-col leading-tight">
                <span
                  className={`${emphasis ? "text-xl font-extrabold" : "text-base font-bold"} ${rateTone(tally)}`}
                >
                  {formatRate(tally)}
                </span>
                {tally.failed + tally.completed > 0 ? (
                  <span className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">
                    <span className="font-semibold text-red-500">{tally.failed}</span> failed
                    <span className="mx-1">·</span>
                    <span className="font-semibold text-emerald-500">{tally.completed}</span> ok
                  </span>
                ) : (
                  <span className="mt-0.5 text-xs text-muted-foreground">no attempts</span>
                )}
              </div>
            </td>
          );
        })}
      </tr>

      {expanded &&
        activePlatforms.map((p) => (
          <tr
            key={p}
            className="bg-muted/15 hover:bg-muted/25 transition-colors border-t border-border/20"
          >
            <th
              scope="row"
              className="py-1.5 pl-6 pr-4 text-left font-normal text-xs text-muted-foreground"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground/40 font-mono text-[11px]">└─</span>
                <span className="font-medium text-foreground/80">{p}</span>
              </div>
            </th>
            {WINDOWS.map((w) => {
              const tally = pickPlatform(w, p) ?? { failed: 0, completed: 0, rate: null };
              return (
                <td key={w} className="py-1.5 pr-4 align-middle text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className={`font-semibold ${rateTone(tally)}`}>
                      {formatRate(tally)}
                    </span>
                    {tally.failed + tally.completed > 0 ? (
                      <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                        <span className="font-semibold text-red-500">{tally.failed}</span>
                        <span className="mx-0.5 text-muted-foreground/60">/</span>
                        <span>{tally.failed + tally.completed}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40">—</span>
                    )}
                  </div>
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
}

export function FailureRateCard({
  rates,
  gameSlug,
}: {
  rates: FailureRates;
  /** Empty for the whole catalog; a slug when the console is filtered. */
  gameSlug?: string;
}) {
  const anyData = WINDOWS.some((w) => rates[w].overall.rate !== null);
  const scope = gameSlug ? gameSlug : "all games";
  const hasPlatforms = (rates.platforms || []).length > 0;

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    Overall: true,
    Installs: true,
    Launches: true,
    Party: true,
  });

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allExpanded = Object.values(expandedSections).every(Boolean);

  const toggleAll = () => {
    const nextState = !allExpanded;
    setExpandedSections({
      Overall: nextState,
      Installs: nextState,
      Launches: nextState,
      Party: nextState,
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <AlertTriangle className="size-4 text-primary" /> Failure rate
            {/* Say what is being counted — the card follows the game filter,
                and an unlabelled number is easy to read as catalog-wide. */}
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {scope}
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Share of finished installs, launches and party operations that failed, with per-platform breakdown.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasPlatforms && anyData && (
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Layers className="size-3" />
              {allExpanded ? "Collapse platforms" : "Expand platforms"}
            </button>
          )}
          <Trend current={rates.d1.overall} baseline={rates.d30.overall} />
        </div>
      </div>

      {anyData ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="py-1 pr-4 font-semibold">
                  <span>Metric &amp; Platform</span>
                </th>
                {WINDOWS.map((w) => (
                  <th key={w} scope="col" className="py-1 pr-4 font-semibold">
                    {WINDOW_LABELS[w]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <MetricSection
                label="Overall"
                pick={(w) => rates[w].overall}
                pickPlatform={(w, p) => rates[w].byPlatform?.[p]?.overall}
                rates={rates}
                emphasis
                expanded={expandedSections.Overall}
                onToggle={() => toggleSection("Overall")}
              />
              <MetricSection
                label="Installs"
                pick={(w) => rates[w].installs}
                pickPlatform={(w, p) => rates[w].byPlatform?.[p]?.installs}
                rates={rates}
                expanded={expandedSections.Installs}
                onToggle={() => toggleSection("Installs")}
              />
              <MetricSection
                label="Launches"
                pick={(w) => rates[w].launches}
                pickPlatform={(w, p) => rates[w].byPlatform?.[p]?.launches}
                rates={rates}
                expanded={expandedSections.Launches}
                onToggle={() => toggleSection("Launches")}
              />
              <MetricSection
                label="Party"
                pick={(w) => rates[w].party}
                pickPlatform={(w, p) => rates[w].byPlatform?.[p]?.party}
                rates={rates}
                expanded={expandedSections.Party}
                onToggle={() => toggleSection("Party")}
              />
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
          No installs or launches finished in the last 30 days.
        </p>
      )}
    </section>
  );
}
