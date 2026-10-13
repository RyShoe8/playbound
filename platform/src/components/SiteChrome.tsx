"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { NewSiteShell } from "@/components/new/NewSiteShell";
import { DiscoveryModeToggle } from "@/components/DiscoveryModeToggle";
import { GameCompatibilityToggle } from "@/components/GameCompatibilityToggle";
import { openDiscordInvite } from "@/lib/openPlayboundDeepLink";
import { SITE_DISCORD_INVITE } from "@/lib/site";

export function SiteChrome() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.dataset.previewPage = pathname.split("/")[1] || "home";
  }, [pathname]);
  return <><NewSiteShell /><details className="design-preview-mobile"><summary>Discover, compatibility & community</summary><div className="space-y-4 p-3"><DiscoveryModeToggle variant="sidebar" /><GameCompatibilityToggle variant="sidebar" /><button onClick={() => openDiscordInvite(SITE_DISCORD_INVITE)} className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">Join Discord</button></div></details></>;
}
