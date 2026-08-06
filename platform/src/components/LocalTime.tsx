"use client";

import { useEffect, useState } from "react";

/**
 * A timestamp rendered in the viewer's own timezone.
 *
 * Calling toLocaleString() in a server component formats against the server's
 * clock — UTC on Vercel — so admin tables showed times that matched nobody's
 * wall clock. Only the browser knows the viewer's zone, so the final format has
 * to happen after mount.
 *
 * The server still renders a readable UTC string rather than a blank, so the
 * column has content on first paint and without JavaScript; it is swapped for
 * the local rendering once mounted. `suppressHydrationWarning` is required
 * because the two deliberately differ — that is the whole point.
 *
 * The machine-readable ISO value stays in the `dateTime` attribute either way.
 */
export function LocalTime({
  value,
  className,
}: {
  /** ISO 8601 string. */
  value: string | null | undefined;
  className?: string;
}) {
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return;
    setLocal(d.toLocaleString());
  }, [value]);

  if (!value) return <span className={className}>—</span>;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return <span className={className}>—</span>;

  // Pre-hydration fallback, explicitly labelled so a UTC time is never mistaken
  // for a local one in the moment before the swap.
  const fallback = `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;

  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {local ?? fallback}
    </time>
  );
}
