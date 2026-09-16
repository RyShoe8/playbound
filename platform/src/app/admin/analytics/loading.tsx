export default function AdminAnalyticsLoading() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <div className="h-9 w-36 animate-pulse rounded-lg bg-muted" />
        <div className="mt-1 h-4 w-80 animate-pulse rounded bg-muted/60" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl border border-border bg-card/40" />
        <div className="h-72 animate-pulse rounded-xl border border-border bg-card/40" />
      </div>
    </div>
  );
}
