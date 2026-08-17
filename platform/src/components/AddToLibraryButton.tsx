"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LibraryBig, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { launcherLocateUrl } from "@/lib/launcher";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { shouldOfferLauncher } from "@/lib/mobilePlay";

type Props = {
  slug: string;
  initiallyInLibrary: boolean;
  signedIn: boolean;
  size?: "md" | "lg";
  /**
   * When true (incompatible with this device), save without launching the
   * locate flow — "Save for later" / install on another machine.
   */
  saveForLater?: boolean;
};

export function AddToLibraryButton({
  slug,
  initiallyInLibrary,
  signedIn,
  size = "md",
  saveForLater = false,
}: Props) {
  const { device } = useCompatibilityFilter();
  const router = useRouter();
  const [inLibrary, setInLibrary] = useState(initiallyInLibrary);
  const [busy, setBusy] = useState(false);

  // Phones/tablets never hand off to the desktop locate deep link.
  const skipLocate = saveForLater || !shouldOfferLauncher(device.type);

  const className = cn(
    "inline-flex items-center gap-2 rounded-full border border-border bg-secondary font-bold transition-all hover:bg-secondary/80 active:translate-y-px disabled:opacity-60",
    size === "lg" ? "h-12 px-5 text-base" : "h-9 px-4 text-sm"
  );
  const iconClass = size === "lg" ? "size-5" : "size-4";

  if (!signedIn) {
    return (
      <Link href={`/login?callbackUrl=/games/${slug}`} className={className}>
        <LogIn className={iconClass} />
        Sign in to add
      </Link>
    );
  }

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !inLibrary;
    setInLibrary(next);
    try {
      if (next) {
        const res = await fetch("/api/library", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            slug,
            intent: skipLocate ? "save" : "install",
          }),
        });
        if (!res.ok) {
          setInLibrary(false);
          return;
        }
        if (!skipLocate) {
          window.location.href = launcherLocateUrl(slug);
        }
      } else {
        const res = await fetch(`/api/library?slug=${encodeURIComponent(slug)}`, {
          method: "DELETE",
        });
        if (!res.ok) setInLibrary(true);
        else router.refresh();
      }
    } catch {
      setInLibrary(!next);
    } finally {
      setBusy(false);
    }
  }

  const label = inLibrary
    ? "In library"
    : skipLocate
      ? "Save to Library"
      : "Add to Library";

  return (
    <button type="button" disabled={busy} onClick={() => void toggle()} className={className}>
      <LibraryBig className={iconClass} />
      {label}
    </button>
  );
}
