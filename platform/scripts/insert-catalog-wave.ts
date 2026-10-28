/** Apply one reviewed catalog patch, then let the Action clear its pending file. */
import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Kind = "game" | "edition" | "mod";
type Fields = Record<string, unknown>;
type Operation = { kind: Kind; key: string; expected: Fields; set: Fields };
type Wave = { id: string | null; operations: Operation[] };

const PENDING_PATH = resolve(process.cwd(), "scripts/catalog-wave.pending.json");
const FORBIDDEN_FIELDS = new Set([
  "_id", "id", "slug", "gameSlug", "createdAt", "updatedAt", "__v",
  "status", "published", "publishedAt", "managedBy",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(a: unknown, b: unknown): boolean {
  // Lean Mongo documents contain Dates/ObjectIds; the manifest is plain JSON.
  return isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), b ?? null);
}

function atPath(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) =>
    isRecord(value) ? value[part] : undefined, row);
}

function safeValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(safeValue);
  if (isRecord(value)) return Object.entries(value).every(([key, part]) =>
    /^[A-Za-z][A-Za-z0-9_]*$/.test(key) && !["__proto__", "constructor", "prototype"].includes(key) && safeValue(part));
  return value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

export function parseWave(raw: unknown): Wave {
  if (!isRecord(raw) || Object.keys(raw).sort().join(",") !== "id,operations" || !Array.isArray(raw.operations)) {
    throw new Error("Catalog wave must contain only id and operations");
  }
  if (raw.operations.length === 0) {
    if (raw.id !== null) throw new Error("Empty catalog wave must have a null id");
    return { id: null, operations: [] };
  }
  if (typeof raw.id !== "string" || !/^[a-z0-9][a-z0-9-]{5,79}$/.test(raw.id)) {
    throw new Error("Active catalog wave needs a unique lowercase id");
  }
  if (raw.operations.length > 50) throw new Error("Catalog wave is limited to 50 named records");
  const seen = new Set<string>();
  for (const op of raw.operations) {
    if (!isRecord(op) || Object.keys(op).sort().join(",") !== "expected,key,kind,set" ||
      !["game", "edition", "mod"].includes(String(op.kind)) ||
      typeof op.key !== "string" ||
      !(op.kind === "edition" ? /^[a-z0-9-]+\/[a-z0-9-]+$/.test(op.key) : /^[a-z0-9-]+$/.test(op.key)) ||
      !isRecord(op.expected) || !isRecord(op.set)) {
      throw new Error("Each operation must name one game, edition, or mod with expected and set objects");
    }
    const identity = `${op.kind}:${op.key}`;
    if (seen.has(identity)) throw new Error(`Duplicate catalog target ${identity}`);
    seen.add(identity);
    const fields = Object.keys(op.set);
    if (fields.length === 0 || fields.length > 40 ||
      fields.sort().join(",") !== Object.keys(op.expected).sort().join(",")) {
      throw new Error(`${identity}: expected must name exactly the fields being set`);
    }
    for (const field of fields) {
      const parts = field.split(".");
      if (parts.some((part) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(part)) ||
        parts.some((part) => FORBIDDEN_FIELDS.has(part))) {
        throw new Error(`${identity}: forbidden field ${field}`);
      }
      if (fields.some((other) => other !== field && other.startsWith(`${field}.`))) {
        throw new Error(`${identity}: overlapping fields ${field}`);
      }
      if (same(op.expected[field], op.set[field])) {
        throw new Error(`${identity}: ${field} has no change`);
      }
      if (!safeValue(op.expected[field]) || !safeValue(op.set[field])) {
        throw new Error(`${identity}: ${field} contains an unsafe value`);
      }
    }
  }
  return raw as Wave;
}

async function main() {
  const command = process.argv[2];
  if ((command !== "--check" && command !== "--apply") || process.argv.length !== 3) {
    throw new Error("Use --check or --apply. The pending file is the only catalog wave input.");
  }
  const wave = parseWave(JSON.parse(readFileSync(PENDING_PATH, "utf8")));
  if (wave.operations.length === 0) {
    console.log("Catalog wave empty: no updates pending.");
    return;
  }
  console.log(`Catalog wave ${wave.id}: ${wave.operations.length} named record(s)`);
  if (command === "--check") return;
  if (process.env.GITHUB_ACTIONS !== "true" || !/^mongodb(\+srv)?:\/\//.test(process.env.MONGODB_URI ?? "")) {
    throw new Error("Catalog wave apply requires GitHub Actions and its configured MongoDB URI");
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const Edition = (await import("../src/lib/models/Edition")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const mongoose = (await import("mongoose")).default;
  try {
  await dbConnect();

  const filterFor = (op: Operation) => op.kind === "edition"
    ? { gameSlug: op.key.split("/")[0], slug: op.key.split("/")[1] }
    : { slug: op.key };
  const read = async (op: Operation): Promise<Record<string, unknown> | null> => {
    const filter = filterFor(op);
    if (op.kind === "game") return await CatalogGame.findOne(filter).lean() as Record<string, unknown> | null;
    if (op.kind === "edition") return await Edition.findOne(filter).lean() as Record<string, unknown> | null;
    return await CatalogMod.findOne(filter).lean() as Record<string, unknown> | null;
  };

  // Check every target before the first write. A changed Admin value blocks
  // the wave instead of allowing the old patch to overwrite that person's edit.
  const pending: Operation[] = [];
  for (const op of wave.operations) {
    const current = await read(op);
    if (!current) throw new Error(`${op.kind}:${op.key} does not exist; no upsert allowed`);
    const fields = Object.keys(op.set);
    if (fields.every((field) => same(atPath(current, field), op.set[field]))) {
      console.log(`already applied ${op.kind}:${op.key}`);
      continue;
    }
    const changed = fields.filter((field) => !same(atPath(current, field), op.expected[field]));
    if (changed.length > 0) {
      throw new Error(`${op.kind}:${op.key} changed since review at [${changed.join(", ")}]; wave stopped without overwriting Admin data`);
    }
    pending.push(op);
  }

  for (const op of pending) {
    const filter = { ...filterFor(op), ...op.expected };
    const update = { $set: op.set };
    const options = { upsert: false, runValidators: true, timestamps: false };
    const result = op.kind === "game"
      ? await CatalogGame.updateOne(filter, update, options)
      : op.kind === "edition"
        ? await Edition.updateOne(filter, update, options)
        : await CatalogMod.updateOne(filter, update, options);
    if (result.matchedCount !== 1) {
      throw new Error(`${op.kind}:${op.key} changed during apply; remaining operations stopped`);
    }
    console.log(`patched ${op.kind}:${op.key} fields=[${Object.keys(op.set).join(", ")}]`);
  }
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
