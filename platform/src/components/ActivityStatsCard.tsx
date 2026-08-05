import { Users } from "lucide-react";

export type ActivityStatsRow = {
  label: string;
  value: string | number;
};

/** Right-column activity card. Numbers come from the shared 15-minute snapshot. */
export function ActivityStatsCard({
  title = "Activity",
  playingNow,
  rows,
}: {
  title?: string;
  playingNow: number;
  rows: ActivityStatsRow[];
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
      <div className="mt-3 flex items-baseline gap-2">
        <Users className="size-4 text-primary" />
        <p className="text-2xl font-extrabold tracking-tight">{playingNow.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">playing now</p>
      </div>
      {rows.length > 0 && (
        <dl className="mt-4 space-y-2.5 border-t border-border pt-3 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="text-right font-semibold tabular-nums">
                {typeof row.value === "number" ? row.value.toLocaleString() : row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">Updated every 15 minutes</p>
    </div>
  );
}

/** Homepage header catalog snapshot. */
export function CatalogStatsCard({
  gameCount,
  modCount,
  playingNow,
}: {
  gameCount: number;
  modCount: number;
  playingNow: number;
}) {
  const items = [
    { label: "Games", value: gameCount },
    { label: "Mods", value: modCount },
    { label: "Playing now", value: playingNow },
  ];
  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 sm:max-w-xs lg:w-64">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        On PlayBound
      </p>
      <dl className="mt-3 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="text-xl font-extrabold tabular-nums tracking-tight">
              {item.value.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11px] text-muted-foreground">Updated every 15 minutes</p>
    </div>
  );
}
