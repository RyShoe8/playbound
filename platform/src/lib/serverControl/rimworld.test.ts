import { describe, expect, it } from "vitest";
import { parseStatus, kickCommand, banCommands, unbanCommands, consoleCommandProblem } from "./rcon";
import { defaultSettingValues, getServerSettingProfile } from "./settings";
import { supportsMultiplayer, supportsLauncherParty } from "@/lib/multiplayer/support";

describe("RimWorld Together controls and party eligibility", () => {
  it("offers the multiplayer edition without relabeling vanilla as multiplayer", () => {
    const vanilla = { slug: "rimworld", features: ["Singleplayer"], launcherInstall: {enabled:true,kind:"external",knownExePaths:["RimWorldWin64.exe"]} };
    expect(supportsMultiplayer(vanilla)).toBe(false);
    expect(supportsLauncherParty(vanilla)).toBe(false);
    const withEdition = {...vanilla,editions:[{features:["Multiplayer"]}]};
    expect(supportsMultiplayer(withEdition)).toBe(true);
    expect(supportsLauncherParty(withEdition)).toBe(true);
  });
  it("uses encoded player identities for names containing spaces", () => {
    const id=Buffer.from("Jacky Daytona").toString("base64");
    const rows=parseStatus("console-rimworld",JSON.stringify([{id,name:"Jacky Daytona",address:"127.0.0.1"}]));
    expect(rows[0].name).toBe("Jacky Daytona");
    expect(kickCommand("console-rimworld",id)).toBe(`pbkick ${id}`);
    expect(()=>kickCommand("console-rimworld","abc\nresetserver")).toThrow();
    expect(banCommands("console-rimworld","127.0.0.1")).toEqual(["banip 127.0.0.1"]);
    expect(unbanCommands("console-rimworld","127.0.0.1")).toEqual(["pardonip 127.0.0.1"]);
  });
  it("protects worlds and service configuration from console bypass", () => {
    for(const cmd of ["resetserver","resetplayer Jacky","togglebrowser","maxplayers 1000","list\nresetserver"]) expect(consoleCommandProblem(cmd,"console-rimworld")).not.toBeNull();
    for(const cmd of ["backup","forcesave Jacky","setpassword test","broadcast Welcome"]) expect(consoleCommandProblem(cmd,"console-rimworld")).toBeNull();
    expect(getServerSettingProfile("rimworld")).toBe(getServerSettingProfile("rimworld-together"));
    expect(defaultSettingValues("rimworld")).toMatchObject({automaticBackups:true,backupIntervalHours:1,backupCount:6});
  });
});
