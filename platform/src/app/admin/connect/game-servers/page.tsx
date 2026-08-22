import type { Metadata } from "next";
import Link from "next/link";
import { ConnectManager } from "@/components/admin/ConnectManager";

export const metadata: Metadata = {
  title: "Game Servers — Connect Admin",
  description: "PlayBound Connect dedicated hosting and VPS monitoring",
};

export default function ConnectGameServersPage() {
  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Game Servers</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Live VPS resources, dedicated game-host health, spawn tests, and active party rooms for PlayBound Connect.
          </p>
        </div>
        <Link
          href="/connect"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary"
        >
          Public Connect page
        </Link>
      </div>
      <ConnectManager />
    </div>
  );
}
