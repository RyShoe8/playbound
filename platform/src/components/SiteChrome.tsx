"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { NewSiteShell } from "@/components/new/NewSiteShell";
import { DiscoveryModeToggle } from "@/components/DiscoveryModeToggle";
import { GameCompatibilityToggle } from "@/components/GameCompatibilityToggle";
import { openDiscordInvite } from "@/lib/openPlayboundDeepLink";
import { SITE_DISCORD_INVITE } from "@/lib/site";

export function SiteChrome() {
  const pathname = usePathname();
  const mobilePanel = useRef<HTMLDetailsElement>(null);
  // Back/Forward restores its own scroll position; only fresh navigations reset.
  const restoring = useRef(false);
  useEffect(() => {
    const onPop = () => { restoring.current = true; };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.previewPage = pathname.split("/")[1] || "home";
    // The mobile panel lives in the persistent shell, so it stayed open on every
    // page after being opened once.
    if (mobilePanel.current) mobilePanel.current.open = false;
    // The App Router scrolls the new page's content into view, not the window,
    // so on phones the (non-sticky) header and menu landed off-screen above.
    if (restoring.current) {
      restoring.current = false;
      return;
    }
    if (!window.location.hash) window.scrollTo(0, 0);
  }, [pathname]);
  return <><NewSiteShell /><details ref={mobilePanel} className="design-preview-mobile"><summary>Discover, compatibility & community</summary><div className="space-y-4 p-3"><DiscoveryModeToggle variant="sidebar" /><GameCompatibilityToggle variant="sidebar" /><button onClick={() => openDiscordInvite(SITE_DISCORD_INVITE)} className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">Join Discord</button></div></details></>;
}
