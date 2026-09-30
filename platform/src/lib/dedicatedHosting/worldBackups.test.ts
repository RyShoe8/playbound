import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORLD_BACKUP_GAMES, hasWorldBackups, isStoppedForRestore } from "./worldBackups";

describe("world-data backups", () => {
  it("lists exactly the games the host agent can back up", () => {
    const agent = readFileSync(join(process.cwd(), "game-host/dedicatedDataBackups.js"), "utf8");
    const block = agent.match(/const WORLD_SOURCES = \{([\s\S]*?)\n\};/)?.[1] ?? "";
    const onHost = [...block.matchAll(/^\s{2}([a-z0-9-]+):/gm)].map((m) => m[1]).sort();
    expect([...WORLD_BACKUP_GAMES].sort()).toEqual(onHost);
  });

  it("offers backups only for games with world data", () => {
    expect(hasWorldBackups("freeciv")).toBe(true);
    expect(hasWorldBackups("morrowind")).toBe(true);
    expect(hasWorldBackups("hurry-curry")).toBe(false);
    expect(hasWorldBackups("constructor")).toBe(false);
  });

  it("only allows a restore when the server is fully stopped", () => {
    expect(isStoppedForRestore({ desiredState: "stopped", runtimeState: "stopped", slotsHeld: false })).toBe(true);
    expect(isStoppedForRestore({ desiredState: "running", runtimeState: "stopped" })).toBe(false);
    expect(isStoppedForRestore({ desiredState: "stopped", runtimeState: "running" })).toBe(false);
    expect(isStoppedForRestore({ desiredState: "stopped", runtimeState: "pending" })).toBe(false);
    expect(isStoppedForRestore({ desiredState: "stopped", runtimeState: "stopped", slotsHeld: true })).toBe(false);
  });
});
