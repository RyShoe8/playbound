import { describe, expect, it } from "vitest";
import {
  PATCH_EDITION_FIELDS,
  PATCH_GAME_FIELDS,
  PATCH_MOD_FIELDS,
} from "../../scripts/insert-catalog-wave.allowlist";

const CURATED_MEDIA_FIELDS = new Set([
  "art",
  "coverImage",
  "screenshots",
  "videos",
]);

describe("recurring catalog wave patches", () => {
  it("leave manually curated images untouched on existing games, editions, and mods", () => {
    for (const patches of [PATCH_GAME_FIELDS, PATCH_EDITION_FIELDS, PATCH_MOD_FIELDS]) {
      for (const [slug, fields] of Object.entries(patches)) {
        for (const field of fields) {
          expect(CURATED_MEDIA_FIELDS.has(field.split(".")[0]!), `${slug}: ${field}`).toBe(false);
        }
      }
    }
  });
});
