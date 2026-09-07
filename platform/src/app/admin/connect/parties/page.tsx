import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { ConnectManager } from "@/components/admin/ConnectManager";
import { PlatformLimitsEditor } from "@/components/admin/PlatformLimitsEditor";
import { getPlatformLimits, getPoolStatus } from "@/lib/entitlements/pool";

export const metadata: Metadata = {
  title: "Parties — Connect Admin",
  description: "Live PlayBound parties, roster, presence, and free slot limits",
};

export default async function ConnectPartiesPage() {
  /*
   * Never prerendered. The limits panel reports how much of the shared pool is
   * claimed right now, and a cached copy of that number is worse than none —
   * an admin would size a live budget against a stale reading.
   */
  await connection();

  const [limits, usage] = await Promise.all([getPlatformLimits(), getPoolStatus()]);

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
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Parties</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Active PlayBound parties from MongoDB — roster, ready state, and in-game presence.
          </p>
        </div>
        <Link
          href="/connect"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary"
        >
          Public Connect page
        </Link>
      </div>

      {/*
        Limits above the roster: the roster is what is happening, and the pool
        is why it can happen. Reading the settings first makes the party list
        below it legible — and the usage figures come from those same parties.
      */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Free slot limits</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Free party seats are a shared pool: every member a subscriber&apos;s own plan does not
            cover draws on it, so how many are free depends on who is playing right now.
            Subscription slots stack on top of whatever is available.
          </p>
        </div>
        <PlatformLimitsEditor
          initialLimits={{
            freePartySlotPool: limits.freePartySlotPool,
            freePartyHardCap: limits.freePartyHardCap,
            maxPartySize: limits.maxPartySize,
            defaultPartySize: limits.defaultPartySize,
            freePartyBaseline: limits.freePartyBaseline,
            poolEnabled: limits.poolEnabled,
          }}
          initialUsage={usage}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight">Live parties</h2>
        <ConnectManager view="parties" />
      </section>
    </div>
  );
}
