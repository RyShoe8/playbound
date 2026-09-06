import type { Metadata } from "next";
import { connection } from "next/server";
import { PlatformLimitsEditor } from "@/components/admin/PlatformLimitsEditor";
import { getPlatformLimits, getPoolStatus } from "@/lib/entitlements/pool";

export const metadata: Metadata = { title: "Party Limits | Admin" };

export default async function AdminPlatformLimitsPage() {
  // Never prerendered — see the admin layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page, and live
  // pool usage must never be served from a cache.
  await connection();

  const [limits, usage] = await Promise.all([getPlatformLimits(), getPoolStatus()]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-black tracking-tight">Party limits</h1>
        <p className="max-w-2xl text-muted-foreground">
          Free party seats are a shared pool: every member a subscriber&apos;s own plan does not
          cover draws on it, so how many are free depends on who is playing right now. Subscription
          slots stack on top of whatever is available.
        </p>
      </header>

      <PlatformLimitsEditor
        initialLimits={{
          freePartySlotPool: limits.freePartySlotPool,
          partyHardCap: limits.partyHardCap,
          freePartyBaseline: limits.freePartyBaseline,
          poolEnabled: limits.poolEnabled,
        }}
        initialUsage={usage}
      />
    </div>
  );
}
