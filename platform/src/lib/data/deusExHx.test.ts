import { describe, expect, it } from "vitest";
import { editions } from "./editions";
import { games } from "./games";
import { mods } from "./mods";
import { hostModesFor, publicLobbyPortFor } from "@/lib/multiplayer/hostModes";
import { getMultiplayerAdapter } from "@/lib/multiplayer/adapters";
import { NEW_EDITION_KEYS, NEW_MOD_SLUGS, PATCH_GAME_FIELDS } from "../../../scripts/insert-catalog-wave.allowlist";

describe("Deus Ex HX co-op", () => {
  it("installs the official archive as a mod and into an isolated edition", () => {
    const mod = mods.find((m) => m.slug === "deus-ex-hx");
    const edition = editions.find((e) => e.gameSlug === "deus-ex" && e.slug === "playbound-hx-coop");
    expect(mod?.downloadKind).toBe("direct-zip");
    expect(mod?.installRelativePath).toBe(".");
    expect(mod?.directUrl).toMatch(/HX-0\.9\.89\.4\.zip$/);
    expect(edition?.installMethod).toBe("playbound_installer");
    expect(edition?.installConfig?.playbound_installer?.kind).toBe("locate-then-zip");
    expect(edition?.installConfig?.playbound_installer?.overlayUrl).toBe(mod?.directUrl);
    expect(edition?.installConfig?.playbound_installer?.knownExePaths).toContain("System/HX.exe");
    expect(NEW_MOD_SLUGS).toContain("deus-ex-hx");
    expect(NEW_EDITION_KEYS).toContain("deus-ex/playbound-hx-coop");
    expect(PATCH_GAME_FIELDS["deus-ex"]).toContain("features");
    expect(games.find((g) => g.slug === "deus-ex")?.status).toBe("testing");
  });

  it("offers a local dedicated server, listen hosting, and direct-IP join", () => {
    expect(hostModesFor("deus-ex")).toContain("self");
    expect(hostModesFor("deus-ex")).not.toContain("dedicated");
    const adapter = getMultiplayerAdapter("deus-ex");
    expect(adapter.adapterType).toBe("direct-ip");
    expect(adapter.host?.binaryHint).toBe("HCC.exe");
    expect(adapter.host?.argsTemplate).toEqual(["server", "01_NYC_UNATCOIsland"]);
    expect(publicLobbyPortFor("deus-ex")).toEqual({ port: 7790, protocol: "udp" });
    expect(adapter.client?.inGameSteps?.join(" ")).toContain("Listen Server");
    expect(adapter.client?.inGameSteps?.join(" ")).toMatch(/HX.*Net Game.*Connect/);
  });
});
