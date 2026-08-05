"use client";

import { useState, type ReactNode } from "react";

/** Shared admin accordion card — matches existing Editorial `<details>` styling. */
export function AdminCollapsibleSection({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="rounded-xl border border-border bg-card p-4"
    >
      <summary className="cursor-pointer text-sm font-bold">
        {title}
        {badge}
      </summary>
      <div className="mt-4 space-y-5">{children}</div>
    </details>
  );
}
