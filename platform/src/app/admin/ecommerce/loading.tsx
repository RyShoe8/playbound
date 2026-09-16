export default function AdminEcommerceLoading() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="mt-1 h-4 w-96 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="h-9 w-36 animate-pulse rounded-full bg-muted/50" />
      </div>

      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-card/40" />
      </div>
    </div>
  );
}
