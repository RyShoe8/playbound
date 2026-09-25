import { describe, expect, it } from "vitest";
import { pickSteamAppEntry } from "./steamAppDetails";

describe("pickSteamAppEntry", () => {
  it("reads the requested key", () => {
    expect(pickSteamAppEntry({ "10": { success: true, data: { steam_appid: 10 } } }, "10")?.success).toBe(true);
  });
  it("finds an entry Steam keyed under another id (Ultimate Chicken Horse)", () => {
    const json = { "493070": { success: true, data: { name: "Ultimate Chicken Horse", steam_appid: 386940 } } };
    expect(pickSteamAppEntry(json, 386940)?.data).toMatchObject({ name: "Ultimate Chicken Horse" });
  });
  it("returns undefined when nothing matches among several", () => {
    expect(pickSteamAppEntry({ "1": { success: true, data: { steam_appid: 1 } }, "2": { success: false } }, "3")).toBeUndefined();
  });
});
