import type { Metadata } from "next";
import { HostingDashboard } from "@/components/hosting/HostingDashboard";

export const metadata: Metadata = {
  title: "My Servers — PlayBound Dedicated",
  robots: { index: false },
};

export default function HostingServersPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <HostingDashboard />
    </div>
  );
}
