import { describe, it, expect } from "vitest";
import { launcherInstallSchema, toPayloadLauncherInstall } from "./gamePayload";
import { toLauncherCatalogEntry, type LauncherInstall } from "./launcherInstall";

/**
 * `needsAdmin` has to survive four hops to do anything.
 *
 * The admin checkbox writes it, toPayloadLauncherInstall shapes the payload,
 * the Zod schema validates the save, and toLauncherCatalogEntry is what the
 * launcher actually reads. Each of those lists fields explicitly, so a field
 * missing from any one of them is dropped in silence — the save succeeds, the
 * box appears ticked until reload, and the game still fails to launch.
 *
 * That is not hypothetical: the flag was added to the model and the launcher
 * first, and the checkbox that sets it was missing entirely, so there was no
 * way to turn it on at all.
 */

const base: LauncherInstall = {
  enabled: true,
  kind: "direct-zip",
  url: "https://example.com/game.zip",
  fileName: "game.zip",
};

describe("needsAdmin survives the whole round trip", () => {
  it("is carried by toPayloadLauncherInstall", () => {
    expect(toPayloadLauncherInstall({ ...base, needsAdmin: true })?.needsAdmin).toBe(true);
  });

  it("is accepted by the schema the admin save validates against", () => {
    const parsed = launcherInstallSchema.parse({ ...base, needsAdmin: true });
    expect(parsed.needsAdmin).toBe(true);
  });

  it("reaches the entry the launcher reads", () => {
    const entry = toLauncherCatalogEntry({
      slug: "metal-slug-awakening",
      title: "Metal Slug Awakening",
      tagline: "Run and gun",
      sizeMB: 100,
      art: { from: "#1e293b", to: "#64748b" },
      launcherInstall: { ...base, needsAdmin: true },
    });
    expect(entry?.needsAdmin).toBe(true);
  });

  it("stays off when nobody turned it on", () => {
    // Elevation must never be the default: a UAC prompt on every launch for
    // games that do not need one would train people to click through it.
    expect(toPayloadLauncherInstall(base)?.needsAdmin).toBeUndefined();
    expect(
      toLauncherCatalogEntry({ slug: "x", title: "X", tagline: "t", sizeMB: 1, art: { from: "#1", to: "#2" }, launcherInstall: base })?.needsAdmin
    ).toBeFalsy();
  });

  it("survives a full payload -> schema -> entry pass", () => {
    // The path an actual save takes, rather than each hop in isolation.
    const payload = toPayloadLauncherInstall({ ...base, needsAdmin: true });
    const validated = launcherInstallSchema.parse(payload);
    const entry = toLauncherCatalogEntry({
      slug: "metal-slug-awakening",
      title: "Metal Slug Awakening",
      tagline: "Run and gun",
      sizeMB: 100,
      art: { from: "#1e293b", to: "#64748b" },
      launcherInstall: validated as LauncherInstall,
    });
    expect(entry?.needsAdmin).toBe(true);
  });
});
