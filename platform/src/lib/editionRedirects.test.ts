import { describe, expect, it } from "vitest";
import { retiredEditionRedirect } from "./editionRedirects";
import { editionPayloadSchema } from "./editionPayload";

describe("retired edition redirects", () => {
  it("sends the old Daggerfall PlayBound edition to Daggerfall Unity", () => {
    expect(retiredEditionRedirect("daggerfall", "playbound-remastered")).toBe("/games/daggerfall/editions/daggerfall-unity");
  });

  it("sends the removed Quake Champions pack to the game page", () => {
    expect(retiredEditionRedirect("quake-champions", "qc-champions-pack")).toBe("/games/quake-champions");
  });

  it("leaves every other edition alone", () => {
    expect(retiredEditionRedirect("daggerfall", "classic-dos")).toBeNull();
  });
});

describe("edition install links", () => {
  const base = { gameSlug: "alien-swarm", slug: "reactive-drop", name: "Reactive Drop" };

  it("accepts storefront protocol links, which are not http(s)", () => {
    const parsed = editionPayloadSchema.safeParse({
      ...base,
      installMethod: "external_installer",
      installConfig: { external_installer: { url: "steam://install/563560" } },
    });
    expect(parsed.success).toBe(true);
  });

  it("still rejects a link with no scheme", () => {
    const parsed = editionPayloadSchema.safeParse({
      ...base,
      installMethod: "external_installer",
      installConfig: { external_installer: { url: "reactivedrop.com" } },
    });
    expect(parsed.success).toBe(false);
  });
});
