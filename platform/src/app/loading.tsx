export default function HomeLoading() {
  return (
    <div className="space-y-12 px-4 py-6 sm:px-6 lg:px-8">
      <header className="pt-4">
        <div className="h-10 max-w-xl animate-pulse rounded bg-muted" />
        <div className="mt-3 h-16 max-w-2xl animate-pulse rounded bg-muted/70" />
      </header>
      <div className="h-56 animate-pulse rounded-2xl bg-muted/60" />
    </div>
  );
}
