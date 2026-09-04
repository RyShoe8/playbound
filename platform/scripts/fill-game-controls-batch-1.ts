/**
 * Add controls to the first explicitly approved catalog batch.
 *
 * SAFETY CONTRACT:
 * - The nine allowed slugs are hardcoded; the script accepts no slug input.
 * - Dry-run by default; writing requires --apply.
 * - No upsert, delete, replacement, edition, or mod operation.
 * - The sole update document is exactly: { $set: { controls } }.
 * - Every payload is schema-validated and every slug must already exist.
 * - After writing, every document field other than controls is compared with
 *   its before value. Even updatedAt stays untouched by using the raw collection.
 *
 * Usage from platform/ on an authorized machine:
 *   npx tsx scripts/fill-game-controls-batch-1.ts
 *   npx tsx scripts/fill-game-controls-batch-1.ts --apply
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gameControlsSchema } from "../src/lib/controls/schema";

const SLUGS = [
  "old-school-runescape",
  "dune-legacy",
  "path-of-exile",
  "eve-online",
  "morrowind",
  "medal-of-honor-allied-assault",
  "thief-2-the-metal-age",
  "thief-gold",
  "star-wars-knights-of-the-old-republic-ii-the-sith-lords",
] as const;

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(SCRIPT_DIR, "..");
const DATA_FILE = resolve(SCRIPT_DIR, "control-batches", "batch-1.json");

function uriLooksReal(value: string | undefined): boolean {
  return Boolean(value && /^mongodb(\+srv)?:\/\//i.test(value));
}

if (!uriLooksReal(process.env.MONGODB_URI)) {
  for (const file of [".env.production.local", ".env.local", ".env"]) {
    const path = resolve(PLATFORM_DIR, file);
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const equals = line.indexOf("=");
      if (equals < 1 || line.slice(0, equals).trim() !== "MONGODB_URI") continue;
      let value = line.slice(equals + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (uriLooksReal(value)) process.env.MONGODB_URI = value;
    }
  }
}

function withoutControls(doc: Record<string, unknown>) {
  const copy = { ...doc };
  delete copy.controls;
  return JSON.stringify(copy);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--apply");
  if (unknownArgs.length) throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`);

  const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Record<string, unknown>;
  const payloadSlugs = Object.keys(raw).sort();
  const expectedSlugs = [...SLUGS].sort();
  if (JSON.stringify(payloadSlugs) !== JSON.stringify(expectedSlugs)) {
    throw new Error("Batch JSON slugs do not exactly match the script's hardcoded allowlist.");
  }

  const controls = new Map<string, unknown>();
  for (const slug of SLUGS) controls.set(slug, gameControlsSchema.parse(raw[slug]));
  console.log(`[controls batch 1] ${SLUGS.length} schema-valid games`);
  for (const slug of SLUGS) {
    const value = controls.get(slug) as { schemes: Array<{ scheme: string; bindings: unknown[] }> };
    console.log(`- ${slug}: ${value.schemes.map((s) => `${s.scheme} (${s.bindings.length})`).join(", ")}`);
  }

  if (!uriLooksReal(process.env.MONGODB_URI)) {
    throw new Error("MONGODB_URI is not a real mongodb:// connection string.");
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  await dbConnect();
  const before = (await CatalogGame.collection.find({ slug: { $in: [...SLUGS] } }).toArray()) as Record<string, unknown>[];
  const bySlug = new Map(before.map((doc) => [String(doc.slug), doc]));
  const missing = SLUGS.filter((slug) => !bySlug.has(slug));
  if (missing.length) throw new Error(`Missing catalog games; nothing written: ${missing.join(", ")}`);

  console.log(`Mongo matched all ${SLUGS.length} hardcoded slugs.`);
  if (!apply) {
    console.log("Dry run complete. Pass --apply to $set controls only.");
    return;
  }

  for (const slug of SLUGS) {
    const result = await CatalogGame.collection.updateOne(
      { slug },
      { $set: { controls: controls.get(slug) } },
      { upsert: false }
    );
    if (result.matchedCount !== 1) throw new Error(`${slug}: expected one match, got ${result.matchedCount}`);
  }

  const after = (await CatalogGame.collection.find({ slug: { $in: [...SLUGS] } }).toArray()) as Record<string, unknown>[];
  const afterBySlug = new Map(after.map((doc) => [String(doc.slug), doc]));
  for (const slug of SLUGS) {
    const oldDoc = bySlug.get(slug)!;
    const newDoc = afterBySlug.get(slug);
    if (!newDoc) throw new Error(`${slug}: document missing after update`);
    if (withoutControls(oldDoc) !== withoutControls(newDoc)) {
      throw new Error(`${slug}: a non-controls field changed; investigate immediately`);
    }
    if (JSON.stringify(newDoc.controls) !== JSON.stringify(controls.get(slug))) {
      throw new Error(`${slug}: stored controls do not match the validated payload`);
    }
  }
  console.log(`Applied controls to ${SLUGS.length} games; all non-controls fields are byte-for-byte JSON-equivalent.`);
}

main().catch((error) => {
  console.error("fill-game-controls-batch-1 failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
