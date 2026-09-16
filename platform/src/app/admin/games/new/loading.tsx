export default function AdminNewGameLoading() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <div className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
        <div className="mt-1 h-4 w-96 animate-pulse rounded bg-muted/60" />
      </div>

      <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
          <div className="flex gap-2">
            <div className="h-10 flex-1 animate-pulse rounded-xl bg-secondary" />
            <div className="h-10 w-24 animate-pulse rounded-xl bg-primary/40" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="h-4 w-20 animate-pulse rounded bg-muted/60" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-secondary" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-20 animate-pulse rounded bg-muted/60" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-secondary" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-secondary" />
        </div>
      </div>
    </div>
  );
}
