import { describe, expect, it } from "vitest";
import CatalogMod from "@/lib/models/CatalogMod";
import { modsBySlug } from "./mods";
import { NEW_MOD_SLUGS } from "../../../scripts/insert-catalog-wave.allowlist";
import { modEditorialReadiness } from "@/lib/enrich";

describe("Battlefield 1942 widescreen patch", () => {
  it("belongs to Anthology and carries the pinned installer archive", async () => {
    const mod = modsBySlug.get("battlefield-1942-widescreen-patch");
    expect(NEW_MOD_SLUGS).toContain(mod?.slug);
    expect(mod?.baseGameSlug).toBe("battlefield-1942-anthology");
    expect(mod?.installerFile).toBe("bf1942widescreenpatch.exe");
    expect(mod?.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(mod?.directUrl).toMatch(/^https:\/\/www\.mediafire\.com\/file\//);
    expect(modEditorialReadiness(mod!).ready).toBe(true);
    await expect(new CatalogMod(mod).validate()).resolves.toBeUndefined();
  });
});
