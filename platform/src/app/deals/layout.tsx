import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * Built through pageMetadata for the same reasons /free-games is: it supplies
 * `alternates`, so this page declares its own canonical instead of inheriting
 * the homepage's, and it leaves the brand to the root layout's
 * `%s · PlayBound` template rather than repeating it.
 */
export const metadata: Metadata = pageMetadata({
  title: "Game Deals",
  description:
    "Every current way to pay less for a good game: live free giveaways from Epic, Steam, GOG, Prime Gaming and Alienware Arena, plus PlayBound catalog games at 75% off or deeper.",
  path: "/deals",
});

export default function DealsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
