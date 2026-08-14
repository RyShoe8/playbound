import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Games This Week | PlayBound",
  description:
    "Track all active and upcoming free game promotions from Epic Games Store, Steam, GOG, and Amazon Prime Gaming. Claim them before they expire.",
  openGraph: {
    title: "Free Games This Week | PlayBound",
    description:
      "Track all active and upcoming free game promotions from Epic Games Store, Steam, GOG, and Amazon Prime Gaming.",
  },
};

export default function FreeGamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen">{children}</div>;
}
