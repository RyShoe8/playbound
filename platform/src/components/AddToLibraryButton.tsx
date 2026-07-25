"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  initiallySaved: boolean;
  signedIn: boolean;
  size?: "md" | "lg";
};

export function AddToLibraryButton({ slug, initiallySaved, signedIn, size = "md" }: Props) {
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);

  const className = cn(
    "inline-flex items-center gap-2 rounded-full border border-border bg-secondary font-bold transition-all hover:bg-secondary/80 active:translate-y-px disabled:opacity-60",
    size === "lg" ? "h-12 px-5 text-base" : "h-9 px-4 text-sm"
  );
  const iconClass = size === "lg" ? "size-5" : "size-4";

  if (!signedIn) {
    return (
      <Link href={`/login?callbackUrl=/games/${slug}`} className={className}>
        <LogIn className={iconClass} />
        Sign in to save
      </Link>
    );
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !saved;
    setSaved(next);
    try {
      const res = next
        ? await fetch("/api/library", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ slug }),
          })
        : await fetch(`/api/library?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!res.ok) setSaved(!next);
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" disabled={busy} onClick={() => void toggle()} className={className}>
      {saved ? <BookmarkCheck className={iconClass} /> : <Bookmark className={iconClass} />}
      {saved ? "In library" : "Add to Library"}
    </button>
  );
}
