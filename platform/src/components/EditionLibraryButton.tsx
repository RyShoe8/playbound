"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, LibraryBig, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Add one edition to the player's library without installing it, from the
 * edition's own page. Backed by the same `savedEditions` list the library page
 * uses, so adding here shows up there and removing there shows up here.
 */
export function EditionLibraryButton({
  slug,
  editionSlug,
  editionName,
  initiallySaved,
  signedIn,
  size = "md",
}: {
  slug: string;
  editionSlug: string;
  editionName: string;
  initiallySaved: boolean;
  signedIn: boolean;
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [busy, setBusy] = useState(false);

  const className = cn(
    "inline-flex items-center gap-2 rounded-full border border-border bg-secondary font-bold transition-all hover:bg-secondary/80 active:translate-y-px disabled:opacity-60",
    size === "lg" ? "h-12 px-5 text-base" : "h-9 px-4 text-sm"
  );
  const iconClass = size === "lg" ? "size-5" : "size-4";

  if (!signedIn) {
    return (
      <Link href={`/login?callbackUrl=/games/${slug}/editions/${editionSlug}`} className={className}>
        <LogIn className={iconClass} />
        Sign in to add
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
            body: JSON.stringify({ slug, editionSlug, intent: "save" }),
          })
        : await fetch(
            `/api/library?slug=${encodeURIComponent(slug)}&editionSlug=${encodeURIComponent(editionSlug)}`,
            { method: "DELETE" }
          );
      if (!res.ok) setSaved(!next);
      else router.refresh();
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void toggle()}
      aria-pressed={saved}
      title={saved ? `Remove ${editionName} from your library` : `Add ${editionName} to your library`}
      className={className}
    >
      {saved ? <Check className={iconClass} /> : <LibraryBig className={iconClass} />}
      {saved ? "In Library" : "Add to Library"}
    </button>
  );
}
