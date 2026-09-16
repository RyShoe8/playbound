export default function AdminOpsLoading() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
        <div className="mt-2 h-9 w-28 animate-pulse rounded-lg bg-muted" />
        <div className="mt-1 h-4 w-96 animate-pulse rounded bg-muted/60" />
      </div>

      <div className="h-40 animate-pulse rounded-xl border border-border bg-card/40" />

      <div className="space-y-4 rounded-xl border border-border bg-card/30 p-4">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-20 animate-pulse rounded-full bg-secondary" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-secondary/50" />
          ))}
        </div>
      </div>
    </div>
  );
}
