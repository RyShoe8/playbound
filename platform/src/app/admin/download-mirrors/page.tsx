import { Metadata } from "next";
import { DownloadMirrorsManager } from "@/components/admin/DownloadMirrorsManager";

export const metadata: Metadata = {
  title: "Download Mirrors & R2 Cache | PlayBound Admin",
  description: "Manage 3-tier resilient download infrastructure, Cloudflare R2 hot cache budget, and public mirror health.",
};

export default function DownloadMirrorsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Download Mirrors & R2 Cache</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Intelligent multi-tier download resilience (Public Mirrors → Cloudflare R2 Hot Cache → PlayBound VPS Authoritative Archive).
        </p>
      </div>

      <DownloadMirrorsManager />
    </div>
  );
}
