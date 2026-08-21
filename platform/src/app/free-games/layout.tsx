import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * Built through pageMetadata rather than by hand.
 *
 * The hand-written version had three faults at once, all of which this fixes:
 * no `alternates`, so it inherited the root canonical and told crawlers the
 * homepage was its canonical version; a partial `openGraph` object with no
 * `images`, which suppressed the opengraph-image.tsx fallback and left the
 * most-shared page on the site with no social card at all; and the brand in
 * the title, which the root layout's `%s · PlayBound` template then repeated.
 */
export const metadata: Metadata = pageMetadata({
  title: "Free Games This Week",
  description:
    "Track all active and upcoming free game promotions from Epic Games Store, Steam, GOG, and Amazon Prime Gaming. Claim them before they expire.",
  path: "/free-games",
});

export default function FreeGamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen">{children}</div>;
}
