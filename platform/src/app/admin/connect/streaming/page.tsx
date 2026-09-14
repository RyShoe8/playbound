import type { Metadata } from "next";
import Link from "next/link";
import { ConnectStreamingManager } from "@/components/admin/ConnectStreamingManager";

export const metadata: Metadata = {
  title: "Streaming — Connect Admin",
  description: "Couch / Connect streaming session metrics",
};

export default function ConnectStreamingPage() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Streaming</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Live Couch Mode sessions: pad slots, transport, and host-reported ping/Hz. Turn collection
          on only while debugging — it posts metrics from the launcher host about every two seconds.
        </p>
      </div>
      <ConnectStreamingManager />
    </div>
  );
}
