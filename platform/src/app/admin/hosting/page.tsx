import type { Metadata } from "next";
import { AdminHostingPanel } from "@/components/admin/AdminHostingPanel";

export const metadata: Metadata = {
  title: "Hosting — Admin",
  description: "PlayBound Dedicated: plans, games, subscriptions and customer servers",
};

export default function AdminHostingPage() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">PlayBound Dedicated</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The paid hosting product at /hosting. Plan settings, the Basic game catalog, subscriptions and every customer
          server. Separate from the PlayBound subscription and from automatic Community Servers.
        </p>
      </div>
      <AdminHostingPanel />
    </div>
  );
}
