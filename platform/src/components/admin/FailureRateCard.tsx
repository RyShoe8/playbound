import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
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

function Row({
  label,
  pick,
  rates,
  emphasis,
}: {
  label: string;
  pick: (w: FailureWindow) => Tally;
  rates: FailureRates;
  emphasis?: boolean;
}) {
  return (
    <tr className={emphasis ? "border-b border-border" : ""}>
      <th
        scope="row"
        className={`py-2 pr-4 text-left align-middle ${
          emphasis ? "text-sm font-bold" : "text-sm font-medium text-muted-foreground"
        }`}
      >
        {label}
      </th>
      {WINDOWS.map((w) => {
        const tally = pick(w);
        return (
          <td key={w} className="py-2 pr-4 align-middle">
            {/*
              Stacked, not inline. Side by side these ran together as "17%4/23",
              and the pair was written failed/total — which reads just as easily
              as failed/succeeded. Both numbers are named now.
            */}
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
            Share of finished installs, launches and party operations that failed.
          </p>
        </div>
        <Trend current={rates.d1.overall} baseline={rates.d30.overall} />
      </div>

      {anyData ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="py-1 pr-4 font-semibold">
                  <span className="sr-only">Metric</span>
                </th>
                {WINDOWS.map((w) => (
                  <th key={w} scope="col" className="py-1 pr-4 font-semibold">
                    {WINDOW_LABELS[w]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Overall" pick={(w) => rates[w].overall} rates={rates} emphasis />
              <Row label="Installs" pick={(w) => rates[w].installs} rates={rates} />
              <Row label="Launches" pick={(w) => rates[w].launches} rates={rates} />
              <Row label="Party" pick={(w) => rates[w].party} rates={rates} />
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
