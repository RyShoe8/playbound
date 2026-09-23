import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * Built through pageMetadata for the same reasons /free-games is: it supplies
 * `alternates`, so this page declares its own canonical instead of inheriting
 * the homepage's, and it leaves the brand to the root layout's
 * `%s · PlayBound` template rather than repeating it.
 */
export const metadata: Metadata = pageMetadata({
  title: "PC Game Deals & Free Giveaways",
  description:
    "Find the deepest PC game deals and live free giveaways. Games at 75% to 95% off and 100% free titles tracked live across Steam, Epic Games, GOG, and GamersGate.",
  path: "/deals",
  images: ["/deals/opengraph-image"],
});

export default function DealsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
