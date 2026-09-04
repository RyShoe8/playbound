import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { gameControlsSchema } from "@/lib/controls/schema";
import CatalogGame from "@/lib/models/CatalogGame";
import dbConnect from "@/lib/db";
import { requireAdminSession } from "@/lib/requireAdmin";
import batch from "../../../../../../scripts/control-batches/batch-1.json";

const SLUGS = [
  "old-school-runescape", "dune-legacy", "path-of-exile", "eve-online", "morrowind",
  "medal-of-honor-allied-assault", "thief-2-the-metal-age", "thief-gold",
  "star-wars-knights-of-the-old-republic-ii-the-sith-lords",
] as const;

function withoutControls(doc: Record<string, unknown>) {
  const copy = { ...doc };
  delete copy.controls;
  return JSON.stringify(copy);
}

/** One-shot admin action: its only database operator is $set controls. */
export async function POST() {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;
    const raw = batch as Record<string, unknown>;
    if (JSON.stringify(Object.keys(raw).sort()) !== JSON.stringify([...SLUGS].sort())) {
      return NextResponse.json({ error: "Batch does not match its hardcoded slug allowlist." }, { status: 500 });
    }
    const controls = new Map(SLUGS.map((slug) => [slug, gameControlsSchema.parse(raw[slug])]));

    await dbConnect();
    const before = (await CatalogGame.collection.find({ slug: { $in: [...SLUGS] } }).toArray()) as Record<string, unknown>[];
    const bySlug = new Map(before.map((doc) => [String(doc.slug), doc]));
    const missing = SLUGS.filter((slug) => !bySlug.has(slug));
    if (missing.length) return NextResponse.json({ error: `Missing slugs: ${missing.join(", ")}. Nothing written.` }, { status: 404 });

    for (const slug of SLUGS) {
      const result = await CatalogGame.collection.updateOne(
        { slug },
        { $set: { controls: controls.get(slug) } },
        { upsert: false }
      );
      if (result.matchedCount !== 1) throw new Error(`${slug}: expected exactly one match`);
    }

    const after = (await CatalogGame.collection.find({ slug: { $in: [...SLUGS] } }).toArray()) as Record<string, unknown>[];
    const afterBySlug = new Map(after.map((doc) => [String(doc.slug), doc]));
    for (const slug of SLUGS) {
      const newDoc = afterBySlug.get(slug);
      if (!newDoc || withoutControls(bySlug.get(slug)!) !== withoutControls(newDoc)) {
        throw new Error(`${slug}: a non-controls field changed`);
      }
    }
    revalidateTag("catalog", { expire: 0 });
    return NextResponse.json({ success: true, updated: SLUGS.length, slugs: SLUGS });
  } catch (error) {
    console.error("Controls batch 1 failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Batch failed" }, { status: 500 });
  }
}
