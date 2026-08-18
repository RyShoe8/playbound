/**
 * Apply editorial fields to production catalog slug `dungeon-keeper-gold` only.
 *
 * CRITICAL:
 * - Hardcoded slug. Never accepts another game.
 * - No upsert.
 * - $set only qualityBar, longDescription, whyWePickedIt, bestFor, notFor,
 *   comparableTo, faq, installSteps.
 * - Does not change status, published, complete, access, media, or any other key.
 *
 * Usage (production URI, e.g. vercel env run --environment production --):
 *   npx tsx scripts/fill-dungeon-keeper-gold-editorial.ts
 *   npx tsx scripts/fill-dungeon-keeper-gold-editorial.ts --apply
 */
import { existsSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const SLUG = "dungeon-keeper-gold";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLATFORM_DIR = resolve(SCRIPT_DIR, "..");
const EDITORIAL_KEYS = [
  "qualityBar",
  "longDescription",
  "whyWePickedIt",
  "bestFor",
  "notFor",
  "comparableTo",
  "faq",
  "installSteps",
] as const;

const PRESERVE_SAMPLE_KEYS = [
  "status",
  "published",
  "complete",
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
] as const;

function uriLooksReal(value: string | undefined): boolean {
  return Boolean(value && /^mongodb(\+srv)?:\/\//i.test(value));
}

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
if (process.env.MONGODB_URI === "[SENSITIVE]" || process.env.MONGODB_URI === "") {
  delete process.env.MONGODB_URI;
}

function pick(doc: Record<string, unknown>, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = doc[key] ?? null;
  return out;
}

function offerSummary(access: unknown) {
  if (!access || typeof access !== "object") return null;
  const a = access as Record<string, unknown>;
  const offers = Array.isArray(a.offers) ? (a.offers as Array<Record<string, unknown>>) : [];
  return {
    priceType: a.priceType ?? null,
    currentPriceCents: a.currentPriceCents ?? null,
    regularPriceCents: a.regularPriceCents ?? null,
    qualifyingPriceCents: a.qualifyingPriceCents ?? null,
    offers: offers.map((o) => ({
      retailer: o.retailer ?? null,
      url: o.url ?? null,
      priceCents: o.priceCents ?? null,
    })),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { editorial } = await import("../src/lib/data/editorial");
  const { editorialReadiness } = await import("../src/lib/enrich");

  const extra = editorial[SLUG];
  if (!extra) {
    console.error(`ERROR: editorial.ts has no block for "${SLUG}".`);
    process.exit(1);
  }

  const payload = {
    qualityBar: extra.qualityBar ?? null,
    longDescription: extra.longDescription ?? null,
    whyWePickedIt: extra.whyWePickedIt ?? null,
    bestFor: extra.bestFor ?? [],
    notFor: extra.notFor ?? [],
    comparableTo: extra.comparableTo ?? [],
    faq: extra.faq ?? [],
    installSteps: extra.installSteps ?? [],
  };

  const readiness = editorialReadiness(payload);
  const words = (payload.longDescription ?? "").trim().split(/\s+/).filter(Boolean).length;
  console.log(`[editorial.ts ${SLUG}]`);
  console.log(`- longDescription words: ${words}`);
  console.log(`- whyWePickedIt chars: ${(payload.whyWePickedIt ?? "").trim().length}`);
  console.log(`- bestFor: ${payload.bestFor.length}`);
  console.log(`- notFor: ${payload.notFor.length}`);
  console.log(`- comparableTo: ${payload.comparableTo.length}`);
  console.log(`- faq: ${payload.faq.length}`);
  console.log(`- installSteps: ${payload.installSteps.length}`);
  console.log(
    `- Editorial Readiness: ${
      readiness.ready ? "READY" : "MISSING: " + readiness.missing.join(", ")
    }`
  );

  if (!readiness.ready) {
    console.error("Refusing to write: editorial is not ready.");
    process.exit(1);
  }

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
        ...beforePreserve,
        access: offerSummary(before.access),
        editorialPresent: {
          qualityBar: Boolean(before.qualityBar),
          longDescriptionLen:
            typeof before.longDescription === "string" ? before.longDescription.length : 0,
          faqCount: Array.isArray(before.faq) ? before.faq.length : 0,
          installStepsCount: Array.isArray(before.installSteps) ? before.installSteps.length : 0,
        },
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("\nDry run. Pass --apply to $set editorial keys only.");
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
  const afterReadiness = editorialReadiness({
    qualityBar: after.qualityBar as typeof payload.qualityBar,
    longDescription: after.longDescription as string,
    whyWePickedIt: after.whyWePickedIt as string,
    bestFor: after.bestFor as string[],
    notFor: after.notFor as string[],
    faq: after.faq as typeof payload.faq,
    installSteps: after.installSteps as typeof payload.installSteps,
  });

  console.log(`\n[Mongo ${SLUG} after]`);
  console.log(`- matched: ${result.matchedCount}, modified: ${result.modifiedCount}`);
  console.log(`- preserved non-editorial sample: ${preservedOk ? "UNCHANGED" : "CHANGED — INVESTIGATE"}`);
  console.log(
    `- Editorial Readiness: ${
      afterReadiness.ready ? "READY" : "MISSING: " + afterReadiness.missing.join(", ")
    }`
  );
  console.log(`- $set keys: ${EDITORIAL_KEYS.join(", ")}`);

  if (!preservedOk) {
    console.error("Non-editorial fields changed. This should not happen.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("fill-dungeon-keeper-gold-editorial failed:", err);
  process.exit(1);
});
