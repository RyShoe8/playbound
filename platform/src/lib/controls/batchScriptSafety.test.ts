import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  path.join(process.cwd(), "scripts", "fill-game-controls-batch-1.ts"),
  "utf8"
);
const script2 = readFileSync(
  path.join(process.cwd(), "scripts", "fill-game-controls-batch-2.ts"),
  "utf8"
);
const script3 = readFileSync(path.join(process.cwd(), "scripts", "fill-game-controls-batch-3.ts"), "utf8");
const script4 = readFileSync(path.join(process.cwd(), "scripts", "fill-game-controls-batch-4.ts"), "utf8");
const script5 = readFileSync(path.join(process.cwd(), "scripts", "fill-game-controls-batch-5.ts"), "utf8");
const script6 = readFileSync(path.join(process.cwd(), "scripts", "fill-game-controls-batch-6.ts"), "utf8");
const route = readFileSync(
  path.join(process.cwd(), "src", "app", "api", "admin", "controls", "batch-1", "route.ts"),
  "utf8"
);
const route2 = readFileSync(
  path.join(process.cwd(), "src", "app", "api", "admin", "controls", "batch-2", "route.ts"),
  "utf8"
);
const route3 = readFileSync(path.join(process.cwd(), "src", "app", "api", "admin", "controls", "batch-3", "route.ts"), "utf8");
const route4 = readFileSync(path.join(process.cwd(), "src", "app", "api", "admin", "controls", "batch-4", "route.ts"), "utf8");
const route5 = readFileSync(path.join(process.cwd(), "src", "app", "api", "admin", "controls", "batch-5", "route.ts"), "utf8");
const route6 = readFileSync(path.join(process.cwd(), "src", "app", "api", "admin", "controls", "batch-6", "route.ts"), "utf8");

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

  it("batch 2 has the same controls-only contract", () => {
    expect(script2).toContain("{ $set: { controls: controls.get(slug) } }");
    expect(script2).toContain("{ upsert: false }");
    expect(script2).not.toMatch(/deleteMany|replaceOne|findOneAndUpdate|bulkWrite/);
    expect(script2).toContain('process.argv.includes("--apply")');
    expect(script2).toContain("withoutControls(oldDoc) !== withoutControls(newDoc)");
    expect(route2).toContain("{ $set: { controls: controls.get(slug) } }");
    expect(route2).toContain("{ upsert: false }");
    expect(route2).not.toMatch(/deleteMany|replaceOne|findOneAndUpdate|bulkWrite/);
    expect(route2).toContain("withoutControls(bySlug.get(slug)!) !== withoutControls(newDoc)");
    expect(route2).toContain("stored controls do not match the validated payload");
  });

  it("batch 3 has the same controls-only contract", () => {
    for (const source of [script3, route3]) {
      expect(source).toContain("{ $set: { controls: controls.get(slug) } }");
      expect(source).toContain("{ upsert: false }");
      expect(source).not.toMatch(/deleteMany|replaceOne|findOneAndUpdate|bulkWrite/);
      expect(source).toContain("a non-controls field changed");
      expect(source).toContain("stored controls do not match the validated payload");
    }
    expect(script3).toContain('process.argv.includes("--apply")');
  });

  it("batch 4 has the same controls-only contract", () => {
    for (const source of [script4, route4]) {
      expect(source).toContain("{ $set: { controls: controls.get(slug) } }");
      expect(source).toContain("{ upsert: false }");
      expect(source).not.toMatch(/deleteMany|replaceOne|findOneAndUpdate|bulkWrite/);
      expect(source).toContain("a non-controls field changed");
      expect(source).toContain("stored controls do not match the validated payload");
    }
    expect(script4).toContain('process.argv.includes("--apply")');
  });

  it("batch 5 has the same controls-only contract", () => {
    for (const source of [script5, route5]) {
      expect(source).toContain("{ $set: { controls: controls.get(slug) } }"); expect(source).toContain("{ upsert: false }");
      expect(source).not.toMatch(/deleteMany|replaceOne|findOneAndUpdate|bulkWrite/); expect(source).toContain("a non-controls field changed"); expect(source).toContain("stored controls do not match the validated payload");
    }
    expect(script5).toContain('process.argv.includes("--apply")');
  });

  it("batch 6 has the same controls-only contract", () => {
    for (const source of [script6, route6]) {
      expect(source).toContain("{ $set: { controls: controls.get(slug) } }"); expect(source).toContain("{ upsert: false }"); expect(source).not.toMatch(/deleteMany|replaceOne|findOneAndUpdate|bulkWrite/); expect(source).toContain("a non-controls field changed"); expect(source).toContain("stored controls do not match the validated payload");
    }
    expect(script6).toContain('process.argv.includes("--apply")');
  });
});
