import { describe, expect, it } from "vitest";
import { shouldStampPublishedAt } from "./catalogStatus";

describe("publication timestamps", () => {
  it("stamps only a transition into published, including legacy boolean status", () => {
    expect(shouldStampPublishedAt({ status: "published" }, "published")).toBe(false);
    expect(shouldStampPublishedAt({ published: true }, "published")).toBe(false);
    expect(shouldStampPublishedAt({ status: "testing" }, "published")).toBe(true);
    expect(shouldStampPublishedAt({ status: "ready" }, "published")).toBe(true);
    expect(shouldStampPublishedAt({ status: "published" }, "testing")).toBe(false);
  });
});
