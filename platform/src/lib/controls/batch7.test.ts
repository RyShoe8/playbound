import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gameControlsSchema } from "./schema";
import { hasControls } from "./types";

const batch = JSON.parse(readFileSync(new URL("../../../scripts/control-batches/batch-7.json", import.meta.url), "utf8")) as Record<string, unknown>;

describe("controls batch 7", () => {
  it("covers 24 games and every one passes the schema with documented bindings", () => {
    expect(Object.keys(batch)).toHaveLength(24);
    for (const [slug, value] of Object.entries(batch)) {
      const parsed = gameControlsSchema.safeParse(value);
      expect(parsed.success, `${slug}: ${parsed.success ? "" : parsed.error.message}`).toBe(true);
      if (parsed.success) expect(hasControls(parsed.data as never), slug).toBe(true);
    }
  });
});
