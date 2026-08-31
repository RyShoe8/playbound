import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Activity } from "lucide-react";
import { AdminOpsConsole } from "@/components/admin/AdminOpsConsole";
import { FailureRateCard } from "@/components/admin/FailureRateCard";
import { familyForArea, type OpsFamily } from "@/lib/admin/opsEvents";
import { getFailureRates } from "@/lib/admin/failureRates";

export const metadata: Metadata = { title: "Admin · Ops" };

async function FailureRateSection({ gameSlug }: { gameSlug: string }) {
  const rates = await getFailureRates({ gameSlug });
  return <FailureRateCard rates={rates} gameSlug={gameSlug} />;
}

export default async function AdminOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; area?: string; family?: string }>;
}) {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const params = await searchParams;
  const family: OpsFamily =
    params.family === "launcher" || params.family === "party" || params.family === "all"
      ? params.family
      : familyForArea(params.area || null);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Admin
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <Activity className="size-7 text-primary" /> Ops
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live launcher and party events. Failures also land on Bugs; health lights on Games are the triage signal.
        </p>
      </div>
      {/* Aggregates 30 days of telemetry, so it must not hold up the live feed.
          Keyed on the game so switching filters refetches rather than showing
          the previous game's numbers. */}
      <Suspense
        key={params.game || "all"}
        fallback={<div className="h-40 animate-pulse rounded-xl border border-border bg-card/40" />}
      >
        <FailureRateSection gameSlug={params.game || ""} />
      </Suspense>

      <AdminOpsConsole initialFamily={family} initialGame={params.game || ""} />
    </div>
  );
}
