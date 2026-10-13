import { describe, expect, it } from "vitest";
import { eventCreationPolicy } from "./creationPolicy";
const body = { title: "Friday Game Night", description: "Play with friends", eventType: "game_night", startsAt: "2026-10-16T23:00:00Z", gameSlug: "openra", hostType: "playbound" as const, featured: true };
describe("public event creation permissions", () => {
  it.each(["user", "developer", "admin_viewer", undefined])("keeps %s creators community-owned and unfeatured", role => {
    expect(eventCreationPolicy(body, role)).toEqual({ ...body, hostType: "community", featured: false });
    expect(body.featured).toBe(true);
  });
  it("preserves an admin's explicit settings", () => {
    expect(eventCreationPolicy(body, "admin")).toBe(body);
  });
});
