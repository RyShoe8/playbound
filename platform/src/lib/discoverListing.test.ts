import { describe, expect, it } from "vitest";
import { games } from "@/lib/data/games";
import { toDiscoverListingGame } from "@/lib/discoverListing";
import { supportsMultiplayer } from "@/lib/multiplayer/support";
import { isGameCompatible, type DeviceType } from "@/lib/compatibility/compatibility";
import { isBrowserGame } from "@/lib/gameLaunch";

describe("Discover listing projection", () => {
  const projected = games.map(toDiscoverListingGame);

  it("keeps multiplayer, browser launch, and device filters identical", () => {
    const devices: DeviceType[] = ["desktop", "macos", "linux", "tablet", "mobile"];
    for (let i = 0; i < games.length; i++) {
      expect(supportsMultiplayer(projected[i]), games[i].slug).toBe(supportsMultiplayer(games[i]));
      expect(isBrowserGame(projected[i]), games[i].slug).toBe(isBrowserGame(games[i]));
      for (const device of devices) {
        expect(isGameCompatible(projected[i], device), `${games[i].slug} on ${device}`)
          .toBe(isGameCompatible(games[i], device));
      }
    }
  });

  it("does not send editorial, media, and install recipes to every Discover visitor", () => {
    expect(projected.length).toBeGreaterThan(50);
    const fullBytes = JSON.stringify(games).length;
    const listingBytes = JSON.stringify(projected).length;
    expect(listingBytes).toBeLessThan(fullBytes / 2);
    expect(Object.keys(projected[0])).not.toContain("longDescription");
    expect(Object.keys(projected[0])).not.toContain("launcherInstall");
  });
});
