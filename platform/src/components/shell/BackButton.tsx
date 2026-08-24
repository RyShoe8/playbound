"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/*
 * Module-level, not state: this needs to survive every client-side navigation
 * for as long as the tab lives, and reset only on a real page load — a
 * useState/useRef pair scoped to the component would reset itself the moment
 * TopBar unmounted, which it does not do here, but relying on that would be
 * fragile. True on the first pathname change onward; false only until then.
 */
let hasNavigatedThisSession = false;

/**
 * Small back button pinned to the top-left of the content area.
 *
 * router.back() drives real browser history (App Router forwards it to
 * window.history.back()), so Next's built-in scroll restoration on
 * popstate applies automatically — no manual scroll bookkeeping needed here,
 * unlike the launcher's single-page shell.
 */
export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(hasNavigatedThisSession);

  useEffect(() => {
    if (hasNavigatedThisSession) {
      setVisible(true);
    } else {
      hasNavigatedThisSession = true;
    }
  }, [pathname]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Back"
      title="Back"
      className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/60 text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
    >
      <ChevronLeft className="size-4" />
    </button>
  );
}
