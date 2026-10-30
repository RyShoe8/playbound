import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ensureIndexes } from "./ensureIndexes";

const model = (name: string, toCreate: unknown[], toDrop: string[] = [], fail?: string) => ({
  collection: { name },
  diffIndexes: vi.fn(async () => {
    if (fail) throw new Error(fail);
    return { toCreate, toDrop };
  }),
  createIndexes: vi.fn(async () => undefined),
});

describe("creating missing indexes", () => {
  it("creates only what is missing and never drops undeclared indexes", async () => {
    const games = model("cataloggames", [{ slug: 1 }]);
    const users = model("users", [], ["legacy_email_1"]);
    const result = await ensureIndexes([games, users] as never, { apply: true, budgetMs: 60_000, log: () => {} });
    expect(result).toMatchObject({ checked: 2, missing: 1, created: 1, undeclared: [{ collection: "users", indexes: ["legacy_email_1"] }], partial: false });
    expect(games.createIndexes).toHaveBeenCalledTimes(1);
    expect(users.createIndexes).not.toHaveBeenCalled();
    expect(Object.keys(users)).not.toContain("syncIndexes");
  });

  it("only reports on a dry run, keeps going past a failure, and stops for time", async () => {
    const a = model("a", [{ x: 1 }]);
    const broken = model("broken", [], [], "listIndexes failed");
    const dry = await ensureIndexes([a, broken] as never, { apply: false, budgetMs: 60_000, log: () => {} });
    expect(dry).toMatchObject({ missing: 1, created: 0, failed: [{ collection: "broken", error: "listIndexes failed" }] });
    expect(a.createIndexes).not.toHaveBeenCalled();
    let t = 0;
    const timed = await ensureIndexes([model("b", []), model("c", [])] as never, { apply: true, budgetMs: 5, now: () => (t += 10), log: () => {} });
    expect(timed.partial).toBe(true);
  });
});

describe("the model list the index check loads", () => {
  it("includes every model file, so a new model's indexes are created too", () => {
    const dir = join(process.cwd(), "src", "lib", "models");
    const listed = readFileSync(join(dir, "allModels.ts"), "utf8");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "allModels.ts");
    for (const file of files) expect(listed, `${file} is missing from allModels.ts`).toContain(`'@/lib/models/${file.replace(/\.ts$/, "")}'`);
  });
});
