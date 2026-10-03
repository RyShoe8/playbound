import { describe, expect, it } from "vitest";
import { bombSquadVersionKey, pickBombSquadBuild } from "@/lib/catalogVersionProbe";
import { gameProbePatchFields } from "@/lib/applyVersionProbePatch";

const files = (v: string) =>
  `BombSquad_Windows_${v}.zip BombSquad_Mac_${v}.dmg BombSquad_Linux_x86_64_${v}.tar.gz BombSquad_Server_Windows_${v}.zip`;

describe("BombSquad build index probe", () => {
  it("orders alpha < beta < release", () => {
    const k = (v: string) => bombSquadVersionKey(v)!;
    expect(k("1.8.0a116")).toEqual([1, 8, 0, 0, 116]);
    expect(k("1.8.0b3")[3]).toBeGreaterThan(k("1.8.0a116")[3]);
    expect(k("1.8.0")[3]).toBeGreaterThan(k("1.8.0b3")[3]);
    expect(bombSquadVersionKey("nope")).toBeNull();
  });

  it("picks the newest build across alpha, beta and release", () => {
    const listing = [files("1.8.0a116"), files("1.8.0b3"), files("1.8.0b10")].join("\n");
    expect(pickBombSquadBuild(listing)).toEqual({
      version: "1.8.0b10",
      windows: "BombSquad_Windows_1.8.0b10.zip",
      mac: "BombSquad_Mac_1.8.0b10.dmg",
      linux: "BombSquad_Linux_x86_64_1.8.0b10.tar.gz",
    });
    expect(pickBombSquadBuild(`${files("1.8.0b3")}\n${files("1.8.0")}`)?.version).toBe("1.8.0");
  });

  it("ignores server packages and builds missing a platform", () => {
    const partial = "BombSquad_Windows_1.9.0.zip BombSquad_Server_Windows_1.9.0.zip";
    expect(pickBombSquadBuild(`${files("1.8.0b3")}\n${partial}`)?.version).toBe("1.8.0b3");
    expect(pickBombSquadBuild(partial)).toBeNull();
  });

  it("heals Windows, Mac and Linux URLs for a direct recipe", () => {
    const set = gameProbePatchFields(
      { kind: "direct-zip" },
      {
        status: "updated",
        detectedVersion: "1.8.0b4",
        note: "BombSquad build index",
        patch: { url: "w", urlMac: "m", urlLinux: "l", versionLabel: "1.8.0b4" },
      }
    );
    expect(set).toEqual({
      "launcherInstall.url": "w",
      "launcherInstall.urlMac": "m",
      "launcherInstall.urlLinux": "l",
      "launcherInstall.versionLabel": "1.8.0b4",
    });
  });
});
