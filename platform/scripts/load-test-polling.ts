/**
 * Load test for the party/friends polling endpoints.
 *
 * partyStore.ts and friendsStore.ts poll GET /api/parties and GET /api/friends
 * every 1-5s per active viewer — the same pattern that took down a previous
 * project's Vercel + Firebase backend at ~150 concurrent players. This script
 * fires N concurrent requests at those endpoints for a fixed duration and
 * reports latency percentiles and error rate, so headroom can be checked
 * deliberately instead of discovered during a real traffic spike.
 *
 * This hits real endpoints with real auth. Point it at a local dev server
 * unless you specifically intend to load a live deployment, and confirm with
 * whoever owns that deployment first if it isn't yours.
 *
 * Usage:
 *   tsx scripts/load-test-polling.ts \
 *     --base http://localhost:3000 \
 *     --cookie "next-auth.session-token=..." \
 *     --concurrency 200 \
 *     --duration 30
 *
 * Auth: pass a real session cookie (copy the `next-auth.session-token` value
 * from your browser's dev tools while logged in) via --cookie, or a launcher
 * bearer token via --token. One identity's session is reused across all
 * concurrent requests — this measures request throughput and latency under
 * concurrency, not per-user data correctness, which is what the endpoints'
 * own test suites already cover.
 */

export {};

type Args = {
  base: string;
  cookie: string | null;
  token: string | null;
  concurrency: number;
  durationSec: number;
  paths: string[];
};

function parseArgs(argv: string[]): Args {
  const get = (flag: string, fallback?: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : fallback;
  };
  const base = get("--base", "http://localhost:3000")!.replace(/\/$/, "");
  const cookie = get("--cookie") ?? null;
  const token = get("--token") ?? null;
  const concurrency = Number(get("--concurrency", "50"));
  const durationSec = Number(get("--duration", "20"));
  const pathsArg = get("--paths", "/api/parties,/api/friends")!;
  const paths = pathsArg.split(",").map((p) => p.trim()).filter(Boolean);
  return { base, cookie, token, concurrency, durationSec, paths };
}

type SampleResult = { ok: boolean; status: number; ms: number; path: string };

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.cookie && !args.token) {
    console.error(
      "Missing auth: pass --cookie \"next-auth.session-token=...\" or --token <launcher-bearer-token>."
    );
    process.exit(1);
  }

  const headers: Record<string, string> = { accept: "application/json" };
  if (args.cookie) headers.cookie = args.cookie;
  if (args.token) headers.authorization = `Bearer ${args.token}`;

  console.log(
    `Load testing ${args.paths.join(", ")} on ${args.base} — ${args.concurrency} concurrent workers for ${args.durationSec}s`
  );

  const results: SampleResult[] = [];
  const stopAt = Date.now() + args.durationSec * 1000;
  let inFlight = 0;
  let maxInFlight = 0;

  async function worker(id: number) {
    let i = 0;
    while (Date.now() < stopAt) {
      const path = args.paths[(id + i) % args.paths.length];
      i += 1;
      const start = Date.now();
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        const res = await fetch(`${args.base}${path}`, { headers });
        // Drain the body so the connection is actually released back to the pool.
        await res.arrayBuffer().catch(() => {});
        results.push({ ok: res.ok, status: res.status, ms: Date.now() - start, path });
      } catch (err) {
        results.push({
          ok: false,
          status: 0,
          ms: Date.now() - start,
          path,
        });
        if (results.length % 50 === 0) {
          console.warn("sample error:", err instanceof Error ? err.message : err);
        }
      } finally {
        inFlight -= 1;
      }
    }
  }

  const workers = Array.from({ length: args.concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  const byPath = new Map<string, SampleResult[]>();
  for (const r of results) {
    if (!byPath.has(r.path)) byPath.set(r.path, []);
    byPath.get(r.path)!.push(r);
  }

  console.log(`\nTotal requests: ${results.length}  (peak concurrency reached: ${maxInFlight})\n`);

  for (const [path, samples] of byPath) {
    const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
    const errors = samples.filter((s) => !s.ok);
    const statusCounts = new Map<number, number>();
    for (const s of samples) statusCounts.set(s.status, (statusCounts.get(s.status) || 0) + 1);

    console.log(`${path}`);
    console.log(`  requests: ${samples.length}, errors: ${errors.length} (${((errors.length / samples.length) * 100).toFixed(1)}%)`);
    console.log(
      `  latency ms — p50: ${percentile(sorted, 50)}, p90: ${percentile(sorted, 90)}, p95: ${percentile(sorted, 95)}, p99: ${percentile(sorted, 99)}, max: ${sorted[sorted.length - 1] ?? 0}`
    );
    console.log(
      `  status codes: ${[...statusCounts.entries()].map(([k, v]) => `${k}×${v}`).join(", ")}`
    );
  }

  const totalErrors = results.filter((r) => !r.ok).length;
  if (totalErrors > 0) {
    console.log(`\n${totalErrors} of ${results.length} requests failed — see status codes above.`);
    process.exitCode = 1;
  } else {
    console.log("\nNo failed requests.");
  }
}

void main();
