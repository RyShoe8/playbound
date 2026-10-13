import Link from "next/link";

/** Lightweight links to the entire catalog, independent of card batching. */
export function CatalogDirectory({ title, entries }: {
  title: string;
  entries: { title: string; href: string }[];
}) {
  if (!entries.length) return null;
  return (
    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer font-semibold">{title} ({entries.length})</summary>
      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...entries].sort((a, b) => a.title.localeCompare(b.title)).map((entry) => (
          <li key={entry.href}>
            <Link href={entry.href} prefetch={false} className="text-sm text-muted-foreground hover:text-primary hover:underline">
              {entry.title}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
