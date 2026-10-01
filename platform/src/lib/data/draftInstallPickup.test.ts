import { describe, expect, it } from "vitest";
import { DRAFT_INSTALL_PICKUP } from "./draftInstallPickup";
import { editions } from "./editions";
import { NEW_EDITION_KEYS } from "../../../scripts/insert-catalog-wave.allowlist";
import Edition from "@/lib/models/Edition";
import { retailerToStoreSlug, STORE_CAPABILITIES } from "@/lib/commerce/stores";
import { launcherInstallSchema } from "@/lib/gamePayload";
import { toLauncherCatalogEntry } from "@/lib/launcherInstall";

describe("owned-game executable pickup", () => {
  it("gives each selected game a specific executable and acquisition path", () => {
    expect(Object.keys(DRAFT_INSTALL_PICKUP)).toHaveLength(15);
    for (const [slug, pickup] of Object.entries(DRAFT_INSTALL_PICKUP)) {
      expect(pickup.exeHint, slug).toMatch(/\.exe$/i);
      expect(pickup.knownExePaths.length, slug).toBeGreaterThan(0);
      expect(pickup.knownExePaths.some((path) => path.toLowerCase().endsWith(pickup.exeHint.toLowerCase())), slug).toBe(true);
      expect(pickup.storeUrl, slug).toMatch(/^(?:https:\/\/|steam:\/\/)/);
    }
    expect(DRAFT_INSTALL_PICKUP["battlefield-1942-anthology"].acquisitionAvailable).toBe(false);
    expect(DRAFT_INSTALL_PICKUP["stardew-valley"].storeUrl).toBe("https://www.gog.com/en/game/stardew_valley");
    expect(DRAFT_INSTALL_PICKUP.starbound.storeUrl).toBe("https://www.gog.com/en/game/starbound");
    expect(DRAFT_INSTALL_PICKUP["vintage-story"].storeUrl).toContain("vintagestory.at/store/");
    expect(retailerToStoreSlug("Vintage Story Store")).toBe("vintage_story");
    expect(STORE_CAPABILITIES.vintage_story.discovery).toBe("manual");
  });

  it("makes Alloyed Collective an edition of the base game, not a second executable", async () => {
    const edition = editions.find((item) => item.gameSlug === "risk-of-rain-2" && item.slug === "alloyed-collective");
    expect(NEW_EDITION_KEYS).toContain("risk-of-rain-2/alloyed-collective");
    expect(edition?.installConfig?.steam?.appId).toBe("2781620");
    expect(edition?.requirements?.notes).toContain("632360");
    expect(edition?.installConfig?.playbound_installer).toBeUndefined();
    await expect(new Edition(edition).validate()).resolves.toBeUndefined();
  });

  it("keeps the Deus Ex mod editions on the base-game detection path", () => {
    for (const slug of ["gmdx", "playbound-hx-coop"]) {
      const edition = editions.find((item) => item.gameSlug === "deus-ex-goty-edition" && item.slug === slug);
      const installer = edition?.installConfig?.playbound_installer;
      expect(installer?.kind, slug).toBe(slug === "gmdx" ? "locate-then-nsis" : "locate-then-zip");
      expect(installer?.baseExeHint, slug).toBe("DeusEx");
    }
  });

  it("carries an archived setup executable through validation into the launcher catalog", () => {
    const recipe = launcherInstallSchema.parse({
      enabled: true, kind: "direct-zip", url: "https://mirror.playbound.club/launcher-packages/games/battlefield-1942-the-complete-collection/anthology.zip",
      archiveInstallerName: "bf1942-setup.exe", knownExePaths: ["BF1942.exe"],
    });
    const entry = toLauncherCatalogEntry({
      slug: "battlefield-1942-anthology", title: "Battlefield 1942 Anthology", tagline: "",
      sizeMB: 2500, art: { from: "#123456", to: "#654321" }, launcherInstall: recipe,
    });
    expect(entry.archiveInstallerName).toBe("bf1942-setup.exe");
  });
});
