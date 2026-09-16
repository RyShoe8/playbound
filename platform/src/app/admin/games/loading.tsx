export default function AdminGamesLoading() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-9 w-36 animate-pulse rounded-lg bg-muted" />
          <div className="mt-1 h-4 w-72 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-9 w-32 animate-pulse rounded-full bg-muted/50" />
          <div className="h-9 w-28 animate-pulse rounded-full bg-primary/40" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-9 w-72 animate-pulse rounded-lg bg-secondary/70" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-secondary/70" />
        </div>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                {Array.from({ length: 10 }).map((_, i) => (
                  <th key={i} className="px-4 py-3">
                    <div className="h-3 w-16 animate-pulse rounded bg-muted/50" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }).map((_, i) => (
                <tr key={i} className="border-b border-border bg-card last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 animate-pulse rounded-md bg-muted/60" />
                      <div className="h-4 w-32 animate-pulse rounded bg-muted/50" />
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-3 w-20 animate-pulse rounded bg-muted/40" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-3 w-8 animate-pulse rounded bg-muted/40" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-3 w-8 animate-pulse rounded bg-muted/40" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-5 w-10 animate-pulse rounded bg-muted/40" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-5 w-10 animate-pulse rounded bg-muted/40" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="size-3 animate-pulse rounded-full bg-muted/50" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="size-3 animate-pulse rounded-full bg-muted/50" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="size-3 animate-pulse rounded-full bg-muted/50" />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-6 w-20 animate-pulse rounded bg-muted/50" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
