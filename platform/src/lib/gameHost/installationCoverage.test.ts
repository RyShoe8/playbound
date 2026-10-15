import { expect, it } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { INSTALLATION_UPDATE_KEYS } from "./installationKeys";
import { buildInstallationCoverage } from "./installationCoverage";
import { DEDICATED_ONLY_GAMES, HOSTABLE_GAMES } from "./catalog";

const source = (relative: string) => fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
it("every admin update target is wired to the agent, root scanner, and exact sudo command", () => {
  const targets = source("../../../game-host/installationTargets.js");
  const scanner = source("../../../game-host/playbound-update-scan");
  const sudo = source("../../../game-host/install-update-scanner.sh");
  for (const key of INSTALLATION_UPDATE_KEYS) {
    expect(targets).toMatch(new RegExp(`(?:"${key}"|${key}): \\{\\s*name:`));
    expect(scanner).toContain(`"${key}":`);
    expect(sudo).toContain(`/usr/local/sbin/playbound-update-scan ${key}`);
  }
  const appIds = [...targets.matchAll(/appId: (\d+)/g)].map((match) => match[1]);
  const archiveTargets = [...targets.matchAll(/strategy: "(?:github-(?:jar|appimage|native-binaries)|signed-appimage|official-headless-archive|official-linux-zip|reviewed-distro-native)"/g)];
  expect(appIds.length + archiveTargets.length).toBe(INSTALLATION_UPDATE_KEYS.length);
  expect(new Set(appIds).size).toBe(appIds.length);
  expect(source("../../../game-host/install.sh")).toContain('"$AGENT_SRC/nativeArchive.py"');
  expect(source("../../../game-host/install.sh")).toContain('"$AGENT_SRC/factorioArchive.py"');
  expect(source("../../../game-host/install.sh")).toContain('"$AGENT_SRC/terrariaArchive.py"');
  expect(source("../../../game-host/install.sh")).toContain('"$AGENT_SRC/terraria1458.json"');
  for (const file of ["nativePackageProfiles.json", "packageNativeArchive.py"]) expect(source("../../../game-host/install.sh")).toContain(`"$AGENT_SRC/${file}"`);
  expect(source("../../../game-host/install.sh")).toContain('bash "$AGENT_SRC/install-package-native.sh"');
  const promotion = source("../../../game-host/install-package-native.sh");
  for (const key of ["bzflag", "hedgewars", "openttd", "luanti"]) expect(promotion).toContain(`promote-package-native.py ${key} *`);
  expect(promotion).not.toMatch(/NOPASSWD:.*(?:apt|dpkg|bash|sh )/);
});

it("covers every offered base recipe and fails closed when an agent lacks a handler", () => {
  const rows = buildInstallationCoverage({ targets: [], jobs: [] });
  for (const slug of Object.keys({ ...HOSTABLE_GAMES, ...DEDICATED_ONLY_GAMES })) {
    expect(rows.find((row) => row.id === slug), slug).toBeDefined();
  }
  expect(rows.find((row) => row.id === "unturned")).toMatchObject({ category: "review" });
  expect(rows.find((row) => row.id === "unturned")?.reason).toContain("agent does not expose");
});

it("classifies all current agent recipes without mistaking inherited object keys for games", () => {
  const recipeSource = source("../../../game-host/recipes.js") + source("../../../game-host/dedicatedRecipes.js");
  const slugs = [...recipeSource.matchAll(/^\s{2,4}(?:"([a-z0-9-]+)"|([a-z0-9]+)): \{/gm)].map((match) => match[1] || match[2]);
  // Only actual recipe declarations have a port range; other configuration
  // maps in these files are deliberately excluded from the inventory.
  const recipeSlugs = slugs.filter((slug) => new RegExp(`(?:"${slug}"|${slug}): \\{\\s*(?://[^\\n]*\\n\\s*)*portStart:`).test(recipeSource));
  const rows = buildInstallationCoverage({ targets: INSTALLATION_UPDATE_KEYS.map((key) => ({ key, name: key, installed: true, rollbackAvailable: false })), jobs: [], gameSlugs: [...recipeSlugs, "constructor"] });
  for (const slug of recipeSlugs) {
    const normalized = slug === "0-ad" ? "0ad" : slug;
    expect(rows.find((row) => row.id === normalized), slug).toBeDefined();
    expect(rows.find((row) => row.id === normalized)?.category, slug).not.toBe("review");
  }
  expect(rows.find((row) => row.id === "constructor")).toMatchObject({ name: "Constructor", category: "review" });
});

it("never silently omits an agent-only recipe or creates an action for it", () => {
  const rows = buildInstallationCoverage({ targets: [], jobs: [], gameSlugs: ["aneurism-iv", "future-game", "cs2", "0-ad", "0ad"] });
  expect(rows.find((row) => row.id === "aneurism-iv")).toMatchObject({ name: "ANEURISM IV", category: "private-runtime" });
  expect(rows.find((row) => row.id === "future-game")).toMatchObject({ category: "review" });
  expect(rows.find((row) => row.id === "future-game")?.installationKey).toBeUndefined();
  expect(rows.filter((row) => row.id === "0ad")).toHaveLength(1);
  expect(rows.some((row) => row.id === "cs2")).toBe(false);
});

it("keeps separate edition updates pending instead of inheriting base-depot support", () => {
  const rows = buildInstallationCoverage({ targets: INSTALLATION_UPDATE_KEYS.map((key) => ({ key, name: key, installed: true, rollbackAvailable: false })), jobs: [] });
  expect(rows.filter((row) => row.category === "supported")).toHaveLength(INSTALLATION_UPDATE_KEYS.length);
  expect(rows.find((row) => row.id === "team-fortress-2:open-fortress")).toMatchObject({ category: "edition" });
  expect(rows.find((row) => row.id === "openra:combined-arms")).toMatchObject({ category: "edition" });
  expect(rows.find((row) => row.id === "freedoom")?.reason).toContain("separate engine");
  expect(rows.find((row) => row.id === "rimworld-together")).toMatchObject({ category: "custom-build" });
  expect(rows.find((row) => row.id === "rimworld-together")?.reason).toContain("unmodified upstream package");
});
