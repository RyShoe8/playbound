"use client";

import { useDesignPreview } from "@/components/new/PreviewMode";
import { NewSiteShell } from "@/components/new/NewSiteShell";
import { DiscoveryModeToggle } from "@/components/DiscoveryModeToggle";
import { GameCompatibilityToggle } from "@/components/GameCompatibilityToggle";
import { openDiscordInvite } from "@/lib/openPlayboundDeepLink";
import { SITE_DISCORD_INVITE } from "@/lib/site";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { previewHref, previewPagePath } from "@/lib/designPreview";

/** Preview navigation stays under /new; APIs and external links stay untouched. */
export function DesignPreview() {
  const pathname = usePathname();
  const isPreview = useDesignPreview();
  const router = useRouter();
  useEffect(() => {
    const active = previewPagePath(window.location.pathname) !== null;
    document.documentElement.toggleAttribute("data-warm-preview", active);
    document.documentElement.dataset.previewPage = (previewPagePath(window.location.pathname) ?? "").split("/")[1] || "home";
    if (!active) return;
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.hasAttribute("download") || anchor.hasAttribute("data-exit-preview")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const next = previewHref(anchor.href, window.location.origin);
      if (!next) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === "_blank") return;
      event.preventDefault();
      event.stopPropagation();
      router.push(next);
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [pathname, router]);
  if (!isPreview) return null;
  return <><NewSiteShell /><div className="design-preview-bar"><span>New design preview · Live data and actions</span><a href={previewPagePath(pathname) ?? pathname} data-exit-preview>Exit preview</a></div><details className="design-preview-mobile"><summary>Discover, compatibility & community</summary><div className="space-y-4 p-3"><DiscoveryModeToggle variant="sidebar" /><GameCompatibilityToggle variant="sidebar" /><button onClick={() => openDiscordInvite(SITE_DISCORD_INVITE)} className="rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">Join Discord</button></div></details></>;
}
