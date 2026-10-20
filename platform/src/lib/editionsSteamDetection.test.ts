import { describe, expect, it } from "vitest";
import { toEdition } from "./editions";

const stored = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: "6a972d247e840e51e544838f",
    gameSlug: "alien-swarm",
    slug: "alien-swarm-reactive-drop",
    name: "Alien Swarm: Reactive Drop",
    type: "community",
    status: "active",
    visibility: "public",
    installMethod: "external_installer",
    installConfig: {
      steam: { appId: "563560" },
      external_installer: { url: "steam://install/563560", instructions: "Opens Steam" },
    },
    ...overrides,
  }) as unknown as Parameters<typeof toEdition>[0];

describe("Steam editions carry their own detection fields", () => {
  it("adds the edition's app id and executable names to a stored Steam hand-off", () => {
    const edition = toEdition(stored());
    expect(edition.installMethod).toBe("playbound_installer");
    const config = edition.installConfig.playbound_installer!;
    expect(config.kind).toBe("external");
    expect(config.url).toBe("steam://install/563560");
    expect(config.steamAppId).toBe("563560");
    expect(config.exeHint).toBeTruthy();
    expect(config.knownExePaths?.some((p: string) => p.endsWith("reactivedrop.exe"))).toBe(true);
  });

  it("leaves an edition with a richer stored recipe alone", () => {
    const edition = toEdition(
      stored({ installMethod: "playbound_installer", installConfig: { playbound_installer: { kind: "direct-zip", url: "https://example.org/a.zip" } } })
    );
    expect(edition.installConfig.playbound_installer?.kind).toBe("direct-zip");
  });

  it("does not touch editions without a launcher recipe", () => {
    const edition = toEdition(stored({ slug: "lambda-wars", name: "Lambda Wars" }));
    expect(edition.installMethod).toBe("external_installer");
    expect(edition.installConfig.playbound_installer).toBeUndefined();
  });
});
