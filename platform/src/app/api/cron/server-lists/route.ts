import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cronAuth";
import { refreshServerListSnapshot, serverProviderSlugs } from "@/lib/servers/registry";
import { settleWithLimit } from "@/lib/settleWithLimit";

export const maxDuration = 300;

/**
 * GET|POST /api/cron/server-lists — every five minutes.
 *
 * The only place PlayBound fetches public server lists from upstream masters.
 * Each provider's result goes to ServerListSnapshot; pages, the catalog live
 * stats and the public servers API read those snapshots instead of fetching.
 * Six at a time, so one slow master cannot hold the rest, and a failing one
 * keeps its last good list.
 */
async function run(req: Request) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const settled = await settleWithLimit(serverProviderSlugs(), 6, (slug) => refreshServerListSnapshot(slug));
  const results = settled.map((r) => (r.status === "fulfilled" ? r.value : { slug: "?", ok: false, servers: 0, error: String(r.reason) }));
  const failed = results.filter((r) => !r.ok);
  console.log(
    `[server-lists] ${results.length - failed.length}/${results.length} refreshed in ${Math.round((Date.now() - started) / 1000)}s` +
      (failed.length ? `; failed: ${failed.map((f) => f.slug).join(", ")}` : "")
  );
  return NextResponse.json({ ok: true, refreshed: results.length - failed.length, failed });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
