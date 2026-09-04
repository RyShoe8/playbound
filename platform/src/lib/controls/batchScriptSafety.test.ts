import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  path.join(process.cwd(), "scripts", "fill-game-controls-batch-1.ts"),
  "utf8"
);
const route = readFileSync(
  path.join(process.cwd(), "src", "app", "api", "admin", "controls", "batch-1", "route.ts"),
  "utf8"
);

describe("controls batch database safety", () => {
  it("only issues a controls-only $set with no upsert", () => {
    expect(script).toContain("{ $set: { controls: controls.get(slug) } }");
    expect(script).toContain("{ upsert: false }");
    expect(script).not.toMatch(/deleteMany|replaceOne|findOneAndUpdate|bulkWrite/);
  });

  it("is dry-run by default and uses a hardcoded slug allowlist", () => {
    expect(script).toContain('process.argv.includes("--apply")');
    expect(script).toContain("hardcoded allowlist");
    expect(script).toContain("if (!apply)");
  });

  it("compares all non-controls fields after the write", () => {
    expect(script).toContain("withoutControls(oldDoc) !== withoutControls(newDoc)");
    expect(script).toContain("a non-controls field changed");
  });

  it("the admin runner has the same controls-only contract", () => {
    expect(route).toContain("{ $set: { controls: controls.get(slug) } }");
    expect(route).toContain("{ upsert: false }");
    expect(route).not.toMatch(/deleteMany|replaceOne|findOneAndUpdate|bulkWrite/);
    expect(route).toContain("withoutControls(bySlug.get(slug)!) !== withoutControls(newDoc)");
  });
});
