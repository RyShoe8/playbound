import Link from "next/link";
import { connection } from "next/server";
import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck, AlertTriangle } from "lucide-react";
import { loadAccessGraph } from "@/lib/access/graph";
import { auditAccessGraph, formatCents, resolveAccess } from "@/lib/access/resolver";
import { DEFAULT_VALUE_PRICE_CEILING_CENTS } from "@/lib/access/types";

export const metadata: Metadata = { title: "Admin · Access Audit" };

/**
 * The gate before FREE mode can ship.
 *
 * FREE mode built on an unaudited graph will eventually show someone an
 * experience that asks for money, and one occurrence of that costs more trust
 * than the feature earns. This screen exists to be driven to zero first.
 */
export default async function AccessAuditPage() {
  // Never prerendered — see the layout. Each segment prerenders
  // independently, so the layout's opt-out does not cover this page.
  await connection();
  const graph = await loadAccessGraph();
  const issues = auditAccessGraph(graph, {
    ceilingCents: DEFAULT_VALUE_PRICE_CEILING_CENTS,
  });

  const byKind = { FREE: 0, VALUE: 0 };
  for (const node of graph.values()) {
    byKind[resolveAccess(node.id, graph).tier] += 1;
  }

  const grouped = new Map<string, typeof issues>();
  for (const issue of issues) {
    const list = grouped.get(issue.code) ?? [];
    list.push(issue);
    grouped.set(issue.code, list);
  }

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
          <ShieldCheck className="size-7 text-primary" /> Access Audit
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every game, edition, mod and event, resolved through the dependency graph. FREE mode is
          only trustworthy once this reads zero.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Resolves FREE" value={byKind.FREE} />
        <Stat label="Resolves VALUE" value={byKind.VALUE} />
        <Stat
          label="Issues"
          value={issues.length}
          tone={issues.length === 0 ? "good" : "bad"}
        />
      </div>

      {issues.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-8 text-center">
          <ShieldCheck className="mx-auto size-8 text-emerald-500" />
          <h2 className="mt-3 text-lg font-bold">No unresolved access issues</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every dependency chain resolves. Ceiling: {formatCents(DEFAULT_VALUE_PRICE_CEILING_CENTS)}.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {[...grouped.entries()].map(([code, list]) => (
            <section key={code} className="rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <AlertTriangle className="size-4 text-amber-500" />
                {ISSUE_TITLES[code] ?? code}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                  {list.length}
                </span>
              </h2>
              <ul className="mt-3 space-y-2">
                {list.map((issue) => (
                  <li
                    key={`${issue.code}-${issue.nodeId}`}
                    className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm"
                  >
                    <span className="font-semibold">{issue.label}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {issue.nodeId}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">{issue.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const ISSUE_TITLES: Record<string, string> = {
  UNRESOLVED_DEPENDENCY: "Dependency not in the catalog",
  CIRCULAR_DEPENDENCY: "Circular dependency",
  PAID_WITHOUT_PRICE: "Paid, but no price recorded",
  PRICE_ABOVE_CEILING: "Above the qualifying price ceiling",
  FREE_WITH_PAID_DEPENDENCY: "Marked free, depends on something paid",
  BASE_GAME_REQUIRED_UNSPECIFIED: "Requires a base game, but none named",
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad";
}) {
  const colour =
    tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-red-500" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={`mt-1 text-3xl font-extrabold tabular-nums ${colour}`}>{value}</p>
    </div>
  );
}
