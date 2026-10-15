import { createInstallationStore } from "./installationJobs.js";
import { redactLogLine } from "./managedLogs.js";

/** Existing persisted job files are the outbox; acknowledgement follows both DB writes. */
export function createInstallationFailureReporter({ stateDir, secret, site = "https://playbound.club", request = fetch, now = Date.now }) {
  const store = createInstallationStore(stateDir);
  let running = false, nextAttempt = 0;
  const url = new URL("/api/cron/server-updates", site);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) || url.username || url.password) throw new Error("Invalid update reporting site");
  async function tick() {
    if (running || now() < nextAttempt || !secret) return;
    running = true; nextAttempt = now() + 15 * 60_000;
    try {
      const failures = store.all().filter((job) => ["failed", "interrupted"].includes(job.status) && !job.failureReportedAt)
        .slice(-10).map((job) => ({ id: job.id, key: job.key, action: job.action, status: job.status,
          beforeBuild: typeof job.beforeBuild === "string" ? job.beforeBuild.slice(0, 120) : undefined,
          message: redactLogLine(String(job.message || "Server installation update failed"), [secret]).slice(0, 1000) }));
      if (!failures.length) return;
      const response = await request(url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20_000),
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ failures }) });
      if (!response.ok) throw new Error("Update failure telemetry delivery failed");
      const body = await response.text();
      if (body.length > 4096) throw new Error("Update failure acknowledgement is too large");
      const data = JSON.parse(body);
      if (!Array.isArray(data.acknowledged)) throw new Error("Invalid update failure acknowledgement");
      for (const failure of failures) {
        if (!data.acknowledged.includes(failure.id)) continue;
        const current = store.read(failure.id);
        if (["failed", "interrupted"].includes(current.status)) store.write({ ...current, failureReportedAt: now() });
      }
    } finally { running = false; }
  }
  return { tick };
}
