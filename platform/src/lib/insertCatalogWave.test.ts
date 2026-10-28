import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseWave } from "../../scripts/insert-catalog-wave";

const pendingPath = resolve(process.cwd(), "scripts/catalog-wave.pending.json");
const workflowPath = resolve(process.cwd(), "../.github/workflows/apply-catalog-wave.yml");
const operation = {
  kind: "game", key: "example-game",
  expected: { releaseYear: 2001 }, set: { releaseYear: 2002 },
};

describe("one-use catalog wave", () => {
  it("starts with no pending database updates", () => {
    expect(parseWave(JSON.parse(readFileSync(pendingPath, "utf8")))).toEqual({ id: null, operations: [] });
  });

  it("requires one exact existing record and old values for every field", () => {
    expect(parseWave({ id: "example-wave-1", operations: [operation] }).operations).toHaveLength(1);
    expect(parseWave({ id: "example-wave-1", operations: [{
      kind: "edition", key: "example-game/expanded", expected: { verificationNote: null }, set: { verificationNote: "Verified" },
    }] }).operations).toHaveLength(1);
    expect(() => parseWave({ id: "example-wave-1", operations: [{ ...operation, expected: {} }] })).toThrow("exactly");
    expect(() => parseWave({ id: "example-wave-1", operations: [{ ...operation, set: { published: true }, expected: { published: false } }] })).toThrow("forbidden");
    expect(() => parseWave({ id: "example-wave-1", operations: [{ ...operation, set: { releaseYear: 2001 } }] })).toThrow("no change");
    expect(() => parseWave({ id: "example-wave-1", operations: [{ ...operation, key: "other/game" }] })).toThrow("must name");
  });

  it("rejects bulk, duplicate, or operator-bearing patches", () => {
    expect(() => parseWave({ id: "example-wave-1", operations: [operation, operation] })).toThrow("Duplicate");
    expect(() => parseWave({ id: "example-wave-1", operations: [{ ...operation, set: { options: { $set: 1 } }, expected: { options: null } }] })).toThrow("unsafe");
    expect(() => parseWave({ id: "example-wave-1", operations: Array.from({ length: 51 }, (_, i) => ({ ...operation, key: `game-${i}` })) })).toThrow("50");
  });

  it("clears the reviewed payload only after the apply step succeeds", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    expect(workflow).toContain('"platform/scripts/catalog-wave.pending.json"');
    expect(workflow.indexOf("--apply")).toBeLessThan(workflow.indexOf("Clear the applied wave"));
    expect(workflow).toContain("git push origin HEAD:main");
  });
});
