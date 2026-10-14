import { expect, it } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { INSTALLATION_UPDATE_KEYS } from "./installationKeys";

const source = (relative: string) => fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
it("every admin update target is wired to the agent, root scanner, and exact sudo command", () => {
  const targets = source("../../../game-host/installationTargets.js");
  const scanner = source("../../../game-host/playbound-update-scan");
  const sudo = source("../../../game-host/install-update-scanner.sh");
  for (const key of INSTALLATION_UPDATE_KEYS) {
    expect(targets).toMatch(new RegExp(`(?:"${key}"|${key}): \\{ name:`));
    expect(scanner).toContain(`"${key}":`);
    expect(sudo).toContain(`/usr/local/sbin/playbound-update-scan ${key}`);
  }
  const appIds = [...targets.matchAll(/appId: (\d+)/g)].map((match) => match[1]);
  expect(appIds).toHaveLength(INSTALLATION_UPDATE_KEYS.length);
  expect(new Set(appIds).size).toBe(appIds.length);
});
