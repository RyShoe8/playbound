import { describe, expect, it } from "vitest";
import CatalogGame from "./models/CatalogGame";
import CatalogMod from "./models/CatalogMod";
import { mongoVisibleFilter, normalizeStatus, statusToPublished, withSyncedPublished } from "./catalogStatus";
import { gamePayloadSchema } from "./gamePayload";
import { modPayloadSchema } from "./modPayload";

describe("game Ready status", () => {
  it("is private like Testing, but remains distinct in admin data", () => {
    expect(normalizeStatus({ status: "ready", published: false })).toBe("ready");
    expect(withSyncedPublished({ status: "ready" })).toEqual({ status: "ready", published: false });
    expect(statusToPublished("ready")).toBe(false);
    expect(mongoVisibleFilter()).not.toEqual(mongoVisibleFilter({ includeTesting: true }));
    const publicStatuses = (mongoVisibleFilter().$or as Array<{ status?: { $in?: string[] } }>)[0]?.status?.$in;
    const adminStatuses = (mongoVisibleFilter({ includeTesting: true }).$or as Array<{ status?: { $in?: string[] } }>)[0]?.status?.$in;
    expect(publicStatuses).not.toContain("ready");
    expect(adminStatuses).toContain("ready");
  });

  it("accepts Ready for games without adding it to mods", () => {
    expect(gamePayloadSchema.shape.status.safeParse("ready").success).toBe(true);
    expect(modPayloadSchema.shape.status.safeParse("ready").success).toBe(false);
    expect((CatalogGame.schema.path("status") as { enumValues?: string[] }).enumValues).toContain("ready");
    expect((CatalogMod.schema.path("status") as { enumValues?: string[] }).enumValues).not.toContain("ready");
  });
});
