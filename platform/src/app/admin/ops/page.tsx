import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Activity } from "lucide-react";
import { AdminOpsConsole } from "@/components/admin/AdminOpsConsole";
import { familyForArea, type OpsFamily } from "@/lib/admin/opsEvents";

export const metadata: Metadata = { title: "Admin · Ops" };

export default async function AdminOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; area?: string; family?: string }>;
}) {
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
      <AdminOpsConsole initialFamily={family} initialGame={params.game || ""} />
    </div>
  );
}
