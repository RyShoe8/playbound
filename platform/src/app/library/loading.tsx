export default function LibraryLoading() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8" role="status" aria-live="polite">
      <h1 className="text-3xl font-extrabold">Library</h1>
      <p className="text-sm text-muted-foreground">Loading your games…</p>
      <div aria-hidden="true" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map(key => <div key={key} className="h-72 animate-pulse rounded-xl bg-card" />)}
      </div>
    </div>
  );
}
