/**
 * Apply PC requirement fields to production catalog slug `dungeon-keeper-gold` only.
 *
 * CRITICAL:
 * - Hardcoded slug. Never accepts another game.
 * - No upsert.
 * - $set only systemRequirements and hardwareRequirements.
 * - Does not change status, published, complete, access, editorial, media,
 *   masterCopy, or any other key.
 *
 * Usage (production URI, e.g. vercel env run --environment production --):
 *   npx tsx scripts/fill-dungeon-keeper-gold-specs.ts
 *   npx tsx scripts/fill-dungeon-keeper-gold-specs.ts --apply
 */
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const SLUG = "dungeon-keeper-gold";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(SCRIPT_DIR, "..");
const SPEC_KEYS = ["systemRequirements", "hardwareRequirements"] as const;

const PRESERVE_SAMPLE_KEYS = [
  "status",
  "published",
  "complete",
  "masterCopy",
  "title",
  "tagline",
  "description",
  "access",
  "coverImage",
  "website",
  "gogStoreUrl",
  "steamAppId",
  "launcherInstall",
  "platforms",
  "qualityBar",
  "longDescription",
  "whyWePickedIt",
  "faq",
  "installSteps",
] as const;

function uriLooksReal(value: string | undefined): boolean {
  return Boolean(value && /^mongodb(\+srv)?:\/\//i.test(value));
}

/** Prefer an already-injected URI (vercel env run). Local pull files are often redacted. */
const injectedUri = process.env.MONGODB_URI;
if (!uriLooksReal(injectedUri)) {
  for (const f of [".env.production.local", ".env.local", ".env"]) {
    const p = resolve(PLATFORM_DIR, f);
    if (!existsSync(p)) continue;
    const content = readFileSync(p, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!val || val === "[SENSITIVE]") continue;
      if (key === "MONGODB_URI" && uriLooksReal(process.env.MONGODB_URI)) continue;
      if (val && (!process.env[key] || process.env[key] === "")) {
        process.env[key] = val;
      }
    }
  }
}
if (!uriLooksReal(process.env.MONGODB_URI)) {
  delete process.env.MONGODB_URI;
}

function pick(doc: Record<string, unknown>, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = doc[key] ?? null;
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const {
    DUNGEON_KEEPER_GOLD_SLUG,
    dungeonKeeperGoldHardwareRequirements,
    dungeonKeeperGoldSystemRequirements,
  } = await import("../src/lib/data/dungeonKeeperGoldSpecs");

  if (DUNGEON_KEEPER_GOLD_SLUG !== SLUG) {
    console.error("ERROR: specs module slug does not match hardcoded script slug.");
    process.exit(1);
  }

  const payload = {
    systemRequirements: dungeonKeeperGoldSystemRequirements,
    hardwareRequirements: dungeonKeeperGoldHardwareRequirements,
  };

  console.log(`[specs ${SLUG}]`);
  console.log(`- min: ${payload.systemRequirements.min}`);
  console.log(`- recommended: ${payload.systemRequirements.recommended}`);
  console.log(`- min ramMB: ${payload.hardwareRequirements.min?.ramMB}`);
  console.log(`- min storageMB: ${payload.hardwareRequirements.min?.storageMB}`);
  console.log(`- rec ramMB: ${payload.hardwareRequirements.recommended?.ramMB}`);
  console.log(`- rec storageMB: ${payload.hardwareRequirements.recommended?.storageMB}`);
  console.log(`- provenance: ${payload.hardwareRequirements.provenance?.source}`);

  if (!uriLooksReal(process.env.MONGODB_URI)) {
    console.error("MONGODB_URI is not a mongodb:// connection string.");
    process.exit(1);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  await dbConnect();

  const existing = await CatalogGame.findOne({ slug: SLUG }).lean();
  if (!existing) {
    console.error(`ERROR: slug "${SLUG}" not found. Aborting (no upsert).`);
    process.exit(1);
  }

  const before = existing as Record<string, unknown>;
  const beforePreserve = pick(before, PRESERVE_SAMPLE_KEYS);
  console.log(`\n[Mongo ${SLUG} before]`);
  console.log(
    JSON.stringify(
      {
        ...pick(before, ["status", "published", "complete", "masterCopy", "title"]),
        systemRequirements: before.systemRequirements ?? null,
        hardwareRequirements: before.hardwareRequirements ?? null,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("\nDry run. Pass --apply to $set systemRequirements and hardwareRequirements only.");
    process.exit(0);
  }

  const result = await CatalogGame.updateOne({ slug: SLUG }, { $set: payload });
  if (result.matchedCount !== 1) {
    console.error(`ERROR: matched ${result.matchedCount} documents; expected 1.`);
    process.exit(1);
  }

  const after = (await CatalogGame.findOne({ slug: SLUG }).lean()) as Record<string, unknown> | null;
  if (!after) {
    console.error("ERROR: document missing after update.");
    process.exit(1);
  }

  const afterPreserve = pick(after, PRESERVE_SAMPLE_KEYS);
  const preservedOk = JSON.stringify(beforePreserve) === JSON.stringify(afterPreserve);
  const hw = after.hardwareRequirements as {
    min?: { ramMB?: number; storageMB?: number; cpuText?: string };
    recommended?: { ramMB?: number; storageMB?: number };
  } | null;

  console.log(`\n[Mongo ${SLUG} after]`);
  console.log(`- matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
  console.log(`- preserved non-spec sample: ${preservedOk ? "UNCHANGED" : "CHANGED — INVESTIGATE"}`);
  console.log(`- $set keys: ${SPEC_KEYS.join(", ")}`);
  console.log(`- min ramMB: ${hw?.min?.ramMB}`);
  console.log(`- rec ramMB: ${hw?.recommended?.ramMB}`);

  if (!preservedOk) {
    console.error("Non-spec fields changed. This should not happen.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("fill-dungeon-keeper-gold-specs failed:", err);
  process.exit(1);
});
