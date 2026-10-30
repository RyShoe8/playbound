import type { Model } from "mongoose";

/**
 * Creates the indexes the models declare that are missing from the database. Never drops one:
 * syncIndexes would drop indexes no schema declares, and some were added by hand or by migrations.
 * Those are reported instead.
 *
 * This replaces Mongoose autoIndex in production (see src/lib/db.ts). autoIndex made every cold
 * serverless instance send createIndexes for every model it loaded, holding pooled connections for
 * minutes while page queries waited. The hourly cron (api/cron/ensure-indexes) and
 * scripts/ensure-indexes.ts call this instead, one collection at a time.
 */
export interface EnsureIndexesResult {
  checked: number;
  missing: number;
  created: number;
  /** Indexes in the database that no schema declares: left alone, listed for review. */
  undeclared: { collection: string; indexes: string[] }[];
  failed: { collection: string; error: string }[];
  /** Ran out of time; the rest are checked next time. */
  partial: boolean;
}

type IndexedModel = Pick<Model<unknown>, "diffIndexes" | "createIndexes"> & { collection: { name: string } };

export async function ensureIndexes(models: IndexedModel[], options: { apply: boolean; budgetMs: number; now?: () => number; log?: (line: string) => void }): Promise<EnsureIndexesResult> {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.info(line));
  const started = now();
  const result: EnsureIndexesResult = { checked: 0, missing: 0, created: 0, undeclared: [], failed: [], partial: false };
  for (const model of models) {
    if (now() - started > options.budgetMs) {
      result.partial = true;
      break;
    }
    const collection = model.collection.name;
    try {
      const { toCreate, toDrop } = await model.diffIndexes();
      result.checked += 1;
      if (toDrop.length) result.undeclared.push({ collection, indexes: toDrop.map(String) });
      if (!toCreate.length) continue;
      result.missing += toCreate.length;
      log(`[indexes] ${collection}: ${toCreate.length} missing index(es)${options.apply ? ", creating" : ""}`);
      if (options.apply) {
        await model.createIndexes();
        result.created += toCreate.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({ collection, error: message.slice(0, 300) });
      log(`[indexes] ${collection}: failed: ${message.slice(0, 300)}`);
    }
  }
  log(`[indexes] ${result.checked} collections checked, ${result.missing} missing, ${result.created} created, ${result.failed.length} failed${result.partial ? ", stopped for time" : ""}${result.undeclared.length ? `; undeclared indexes left alone on ${result.undeclared.map((u) => u.collection).join(", ")}` : ""}`);
  return result;
}
