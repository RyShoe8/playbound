import type { Metadata } from "next";
import Link from "next/link";
import { AutomatedEventPlannerManager } from "@/components/admin/AutomatedEventPlannerManager";

export const metadata: Metadata = {
  title: "Automated Event Planner — Connect Admin",
  description: "Automated dedicated server launcher, Game Night event planner, and Discord integration",
};

export default function AutomatedEventPlannerPage() {
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
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Automated Event Planner</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure automatic server provisioning, game rotations, custom durations, and silent Discord pop-up event alerts with 1-click launch links.
          </p>
        </div>
        <Link
          href="/admin/connect/game-servers"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary"
        >
          Game Servers VPS Health →
        </Link>
      </div>
      <AutomatedEventPlannerManager />
    </div>
  );
}
