export default function DiscoverLoading() {
  return (
    <div className="space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <div className="h-9 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-5 max-w-md animate-pulse rounded bg-muted/70" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-muted/60" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[16/10] animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
