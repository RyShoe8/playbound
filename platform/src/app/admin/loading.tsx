import { Shield } from "lucide-react";

export default function AdminLoading() {
  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <Shield className="size-7 text-primary" /> Administration
          </h1>
          <p className="mt-1 text-muted-foreground">Loading dashboard…</p>
        </div>
        <div className="h-10 w-52 animate-pulse rounded-full bg-muted/60" />
      </div>

      {/* KPI tiles */}
      <section>
        <div className="mb-3">
          <div className="h-6 w-44 animate-pulse rounded bg-muted" />
          <div className="mt-1 h-4 w-80 animate-pulse rounded bg-muted/60" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
      </section>

      {/* Games catalog table */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="h-6 w-36 animate-pulse rounded bg-muted" />
            <div className="mt-1 h-4 w-64 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-10 w-28 animate-pulse rounded-full bg-muted/50"
              />
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <div className="w-full min-w-[560px]">
            {/* Table header */}
            <div className="flex border-b border-border bg-secondary/40 px-4 py-3">
              {["Game", "Genres", "Status", "License"].map((col) => (
                <div
                  key={col}
                  className="h-3.5 w-16 animate-pulse rounded bg-muted/40 first:w-24"
                  style={{ flex: col === "Game" ? 2 : 1 }}
                />
              ))}
            </div>
            {/* Table rows */}
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-border bg-card px-4 py-3 last:border-0"
              >
                <div className="flex flex-[2] items-center gap-2.5">
                  <div className="size-8 animate-pulse rounded-md bg-muted/50" />
                  <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
                </div>
                <div className="h-4 w-24 flex-1 animate-pulse rounded bg-muted/30" />
                <div className="h-4 w-16 flex-1 animate-pulse rounded bg-muted/30" />
                <div className="h-4 w-16 flex-1 animate-pulse rounded bg-muted/30" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
