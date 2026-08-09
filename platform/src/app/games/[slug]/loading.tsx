export default function GameLoading() {
  return (
    <div>
      <div className="relative overflow-hidden border-b border-border">
        <div className="h-64 animate-pulse bg-muted/50 sm:h-80" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:px-6 lg:px-8">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-10 max-w-md animate-pulse rounded bg-muted" />
          <div className="mt-2 h-5 max-w-lg animate-pulse rounded bg-muted/70" />
          <div className="mt-4 flex gap-2">
            <div className="h-12 w-36 animate-pulse rounded-full bg-muted" />
            <div className="h-12 w-36 animate-pulse rounded-full bg-muted/70" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 border-b border-border px-4 py-3 sm:px-6 lg:px-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 w-16 animate-pulse rounded bg-muted/60" />
        ))}
      </div>
      <div className="grid gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px] lg:px-8">
        <div className="space-y-6">
          <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
          <div className="h-28 animate-pulse rounded-xl bg-muted/30" />
          <div className="h-28 animate-pulse rounded-xl bg-muted/30" />
        </div>
        <div className="space-y-4">
          <div className="h-48 animate-pulse rounded-xl bg-muted/40" />
          <div className="h-32 animate-pulse rounded-xl bg-muted/30" />
        </div>
      </div>
    </div>
  );
}
