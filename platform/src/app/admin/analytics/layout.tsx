import type { Metadata } from "next";
import { AnalyticsSubNav } from "@/components/admin/AnalyticsSubNav";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnalyticsSubNav />
      {children}
    </>
  );
}
