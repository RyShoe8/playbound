import { describe, expect, it } from "vitest";
import { describeCommand } from "@/lib/dbDiagnostics";

describe("describeCommand", () => {
  it("names the collection and the filter fields, never their values", () => {
    const d = describeCommand("find", { find: "cataloggames", filter: { slug: "secret-value", status: "published" } });
    expect(d).toEqual({ label: "cataloggames.find", filterKeys: "slug,status" });
    expect(JSON.stringify(d)).not.toContain("secret-value");
  });

  it("reads update, delete and aggregate filters", () => {
    expect(describeCommand("update", { update: "parties", updates: [{ q: { _id: 1 } }] })?.filterKeys).toBe("_id");
    expect(describeCommand("delete", { delete: "presence", deletes: [{ q: { userId: 1 } }] })?.filterKeys).toBe("userId");
    expect(describeCommand("aggregate", { aggregate: "events", pipeline: [{ $match: { kind: 1 } }, { $group: {} }] })?.filterKeys).toBe("kind");
  });

  it("skips handshake and cursor bookkeeping commands", () => {
    expect(describeCommand("hello", { hello: 1 })).toBeNull();
    expect(describeCommand("getMore", { getMore: 1, collection: "x" })).toBeNull();
  });
});
