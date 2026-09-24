/** Import the measured VPS inventory into operational profiles only.
 *
 * Dry run by default. --apply inserts missing, disabled/unverified records;
 * never updates an existing profile, publishes a catalog game, or enables a
 * server. Join and query verification must happen separately.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import CommunityServerProfile from "@/lib/models/CommunityServerProfile";
import ServerResourceSample from "@/lib/models/ServerResourceSample";
import { HOSTABLE_SLUGS } from "@/lib/gameHost/catalog";

loadEnvConfig(process.cwd());

type AuditRow = { slug: string; state: string; error?: string | null };
const auditPath = join(process.cwd(), "docs/community-hosting-audit-2026-09-24.json");
const rows = JSON.parse(readFileSync(auditPath, "utf8")) as AuditRow[];
type ResourceRow = { ok: boolean; resources?: { rssBytes: number; cpuCores: number; sampleIntervalMs: number; scope: string; processCount: number }; lastSpawnTest?: Record<string, { at: string }> };
const resources = JSON.parse(readFileSync(join(process.cwd(), "docs/community-hosting-resource-audit-2026-09-24.json"), "utf8")) as Record<string, ResourceRow>;
const bySlug = new Map(rows.map((row) => [row.slug, row]));
const missing = HOSTABLE_SLUGS.filter((slug) => !bySlug.has(slug));
if (missing.length) throw new Error(`Audit is missing catalog recipes: ${missing.join(", ")}`);
const profiles = HOSTABLE_SLUGS.map((slug) => {
  const row = bySlug.get(slug)!;
  return {
    key: `${slug}:base`, gameSlug: slug, editionSlug: null, recipeSlug: slug,
    enabled: false, rotationEligible: false,
    verification: row.state === "spawn-passed" ? "testing" : "blocked",
    blockedReason: row.state === "spawn-passed" ? "Player query, Join, and resource baseline are unverified"
      : row.error || row.state,
    queryKind: "none", queryVerified: false, joinVerified: false,
  };
});

console.log(`[community-audit] ${profiles.length} disabled profiles; ${profiles.filter((p) => p.verification === "testing").length} spawn-passed, none rotation-ready`);
const measured = Object.entries(resources).filter(([slug, row]) => HOSTABLE_SLUGS.includes(slug) && row.ok && row.resources && row.resources.rssBytes > 0 && row.resources.cpuCores >= 0);
console.log(`[community-audit] ${measured.length} one-time process-group measurements, all unverified idle samples`);
async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("[community-audit] dry run; pass --apply to insert missing operational profiles");
  } else {
    await dbConnect();
    try {
      const result = await CommunityServerProfile.bulkWrite(profiles.map((profile) => ({
        updateOne: { filter: { key: profile.key }, update: { $setOnInsert: profile }, upsert: true },
      })), { ordered: false });
      console.log(`[community-audit] inserted ${result.upsertedCount}; existing profiles untouched`);
      let samplesInserted = 0;
      for (const [slug, row] of measured) {
        const r = row.resources!;
        const observedAt = new Date(row.lastSpawnTest?.[slug]?.at || "");
        if (!Number.isFinite(observedAt.getTime())) continue;
        const sampleId = new mongoose.Types.ObjectId(createHash("sha256").update(`community-audit-2026-09-24:${slug}`).digest("hex").slice(0, 24));
        const sample = await ServerResourceSample.updateOne({ _id: sampleId }, { $setOnInsert: {
          _id: sampleId, profileKey: `${slug}:base`, communityServerId: null,
          observedAt, players: null, cpuCores: r.cpuCores, ramBytes: r.rssBytes,
          phase: "idle", source: "audit", sampleIntervalMs: r.sampleIntervalMs,
          processCount: r.processCount, scope: r.scope,
        } }, { upsert: true });
        if (sample.upsertedCount) samplesInserted++;
        const sampleCount = await ServerResourceSample.countDocuments({ profileKey: `${slug}:base` });
        await CommunityServerProfile.updateOne({ key: `${slug}:base` }, {
          $max: {
            sampleCount,
            lastSampleAt: observedAt,
            "envelope.cpuCores": Math.max(0.25, Math.ceil(r.cpuCores * 1.5 * 100) / 100),
            "envelope.ramBytes": Math.ceil(r.rssBytes * 1.3),
          },
        });
      }
      console.log(`[community-audit] inserted ${samplesInserted} baseline samples; rotation remains disabled`);
    } finally {
      await mongoose.disconnect();
    }
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
