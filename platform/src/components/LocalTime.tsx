"use client";

import { useEffect, useState } from "react";

/**
 * A timestamp rendered in the viewer's own timezone.
 *
 * Calling toLocaleString() in a server component formats against the server's
 * clock — UTC on Vercel — so admin tables showed times matching nobody's wall
 * clock. Only the browser knows the viewer's zone, so the final formatting has
 * to happen after mount.
 *
 * The server still renders a readable UTC string rather than a blank, so the
 * column has content on first paint and without JavaScript, and it is labelled
 * so a UTC time is never mistaken for a local one in the moment before the
 * swap. suppressHydrationWarning is required because the two renders
 * deliberately differ — that is the entire point.
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
    // set-state-in-effect is exactly the pattern needed here: the value can
    // only be computed once a browser exists, so the first render has to be
    // the server's and the second the viewer's. Formatting during render
    // instead would produce a hydration mismatch rather than avoid one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(d.toLocaleString());
  }, [value]);

  if (!value) return <span className={className}>—</span>;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return <span className={className}>—</span>;

  const fallback = `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;

  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {local ?? fallback}
    </time>
  );
}
