/**
 * Parse free-text systemRequirements / edition requirements into structured
 * hardwareRequirements and write them into games.ts / editions.ts.
 *
 * Also upserts Mongo when MONGODB_URI is set and the field is currently null.
 *
 * Usage: npx tsx scripts/apply-free-text-hardware.ts
 */
import fs from "fs";
import path from "path";
import { loadEnvConfig } from "@next/env";
import { parseFreeTextRequirementsBlock } from "../src/lib/hardware/parseFreeTextRequirements";
import type { HardwareRequirementsBlock } from "../src/lib/hardware/types";

loadEnvConfig(process.cwd());

function tsLiteral(value: unknown, indent: number): string {
  const pad = " ".repeat(indent);
  const padInner = " ".repeat(indent + 2);
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const parts = value.map((v) => `${padInner}${tsLiteral(v, indent + 2)}`);
    return `[\n${parts.join(",\n")},\n${pad}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    if (!entries.length) return "{}";
    const parts = entries.map(
      ([k, v]) => `${padInner}${k}: ${tsLiteral(v, indent + 2)}`
    );
    return `{\n${parts.join(",\n")},\n${pad}}`;
  }
  return "undefined";
}

function extractQuoted(field: string, block: string): string | undefined {
  const m = block.match(new RegExp(`${field}:\\s*"((?:\\\\.|[^"\\\\])*)"`, "i"));
  return m ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\") : undefined;
}

/** Find matching closing `}` for an object starting at `openBraceIndex`. */
function findObjectEnd(source: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error(`Unbalanced braces near index ${openBraceIndex}`);
}

/** Remove existing top-level hardwareRequirements props (brace-aware). */
function stripHardwareRequirements(source: string): string {
  const re = /\bhardwareRequirements\s*:\s*\{/g;
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const keyStart = match.index;
    // Include leading newline + indent so we don't leave blank weirdness
    let sliceFrom = keyStart;
    const lineStart = source.lastIndexOf("\n", keyStart - 1);
    if (lineStart >= last) sliceFrom = lineStart;

    const braceStart = source.indexOf("{", keyStart);
    const objEnd = findObjectEnd(source, braceStart);
    let end = objEnd;
    while (end < source.length && /\s/.test(source[end])) end++;
    if (source[end] === ",") end++;

    out += source.slice(last, sliceFrom);
    last = end;
    re.lastIndex = end;
  }
  out += source.slice(last);
  return out;
}

function injectAfterBlock(
  source: string,
  blockKey: "systemRequirements" | "requirements",
  collect?: (info: {
    beforeWindow: string;
    blockText: string;
    parsed: HardwareRequirementsBlock;
  }) => void
): { source: string; injected: number; skipped: number } {
  const clean = stripHardwareRequirements(source);
  const re = new RegExp(`\\b${blockKey}\\s*:\\s*\\{`, "g");
  let injected = 0;
  let skipped = 0;
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(clean))) {
    const start = match.index;
    const braceStart = clean.indexOf("{", start);
    const objEnd = findObjectEnd(clean, braceStart);
    let end = objEnd;
    while (end < clean.length && /\s/.test(clean[end])) end++;
    if (clean[end] === ",") end++;

    const blockText = clean.slice(braceStart, objEnd);
    out += clean.slice(last, end);

    const parsed = parseFreeTextRequirementsBlock({
      min: extractQuoted("min", blockText),
      recommended: extractQuoted("recommended", blockText),
    });
    if (!parsed) {
      skipped++;
      last = end;
      continue;
    }

    const indentMatch = clean.slice(clean.lastIndexOf("\n", start) + 1, start).match(/^(\s*)/);
    const indent = indentMatch?.[1] ?? "    ";
    const literal = tsLiteral(parsed, indent.length);
    out += `\n${indent}hardwareRequirements: ${literal},`;
    injected++;
    collect?.({
      beforeWindow: clean.slice(Math.max(0, start - 500), start),
      blockText,
      parsed,
    });
    last = end;
  }

  out += clean.slice(last);
  return { source: out, injected, skipped };
}

async function upsertMongo(
  games: Array<{ slug: string; hw: HardwareRequirementsBlock }>,
  editions: Array<{ gameSlug: string; slug: string; hw: HardwareRequirementsBlock }>
) {
  const uri = process.env.MONGODB_URI || "";
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    console.log("Mongo upsert skipped — MONGODB_URI not set or invalid.");
    return;
  }
  try {
    const dbConnect = (await import("../src/lib/db")).default;
    const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
    const Edition = (await import("../src/lib/models/Edition")).default;
    await dbConnect();

    let gamesUpdated = 0;
    let editionsUpdated = 0;

    for (const g of games) {
      const res = await CatalogGame.updateOne(
        {
          slug: g.slug,
          $or: [{ hardwareRequirements: null }, { hardwareRequirements: { $exists: false } }],
        },
        { $set: { hardwareRequirements: g.hw } }
      );
      if (res.modifiedCount) gamesUpdated++;
    }

    for (const ed of editions) {
      const res = await Edition.updateOne(
        {
          gameSlug: ed.gameSlug,
          slug: ed.slug,
          $or: [{ hardwareRequirements: null }, { hardwareRequirements: { $exists: false } }],
        },
        { $set: { hardwareRequirements: ed.hw } }
      );
      if (res.modifiedCount) editionsUpdated++;
    }

    console.log(`Mongo: games updated=${gamesUpdated}, editions updated=${editionsUpdated}`);
  } catch (err) {
    console.warn("Mongo upsert failed:", err instanceof Error ? err.message : err);
  }
}

async function main() {
  const gamesPath = path.join(process.cwd(), "src/lib/data/games.ts");
  const editionsPath = path.join(process.cwd(), "src/lib/data/editions.ts");

  const gameHw: Array<{ slug: string; hw: HardwareRequirementsBlock }> = [];
  const gamesResult = injectAfterBlock(
    fs.readFileSync(gamesPath, "utf8"),
    "systemRequirements",
    ({ beforeWindow, parsed }) => {
      const slugMatch = beforeWindow.match(/slug:\s*"([^"]+)"\s*,\s*\n\s*title:/);
      if (slugMatch) gameHw.push({ slug: slugMatch[1], hw: parsed });
    }
  );
  fs.writeFileSync(gamesPath, gamesResult.source);
  console.log(
    `games.ts: injected=${gamesResult.injected}, skipped=${gamesResult.skipped}`
  );

  const editionHw: Array<{
    gameSlug: string;
    slug: string;
    hw: HardwareRequirementsBlock;
  }> = [];
  const editionsResult = injectAfterBlock(
    fs.readFileSync(editionsPath, "utf8"),
    "requirements",
    ({ beforeWindow, parsed }) => {
      const m = beforeWindow.match(
        /gameSlug:\s*"([^"]+)"[\s\S]*?slug:\s*"([^"]+)"[\s\S]*$/
      );
      if (m) editionHw.push({ gameSlug: m[1], slug: m[2], hw: parsed });
    }
  );
  fs.writeFileSync(editionsPath, editionsResult.source);
  console.log(
    `editions.ts: injected=${editionsResult.injected}, skipped=${editionsResult.skipped}`
  );

  await upsertMongo(gameHw, editionHw);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
