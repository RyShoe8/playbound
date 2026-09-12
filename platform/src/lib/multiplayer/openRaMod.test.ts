import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { openRaEditionAllowsStockModPicker, openRaModFor } from "./openRaMod";

/**
 * The client's mod must match the server's.
 *
 * OpenRA's ra / cnc / d2k are separate games on one engine, and a client that
 * joins with a different one is rejected as "running an incompatible mod". The
 * dedicated server is started with an explicit Game.Mod; the client was not
 * passed one at all.
 */

describe("mod resolution", () => {
  it("defaults to Red Alert", () => {
    expect(openRaModFor(null)).toBe("ra");
    expect(openRaModFor("")).toBe("ra");
    expect(openRaModFor("official")).toBe("ra");
  });

  it("recognises the other mods", () => {
    expect(openRaModFor("cnc")).toBe("cnc");
    expect(openRaModFor("td")).toBe("cnc");
    expect(openRaModFor("d2k")).toBe("d2k");
    expect(openRaModFor("dune-2000")).toBe("d2k");
    expect(openRaModFor("combined-arms")).toBe("ca");
    expect(openRaModFor("openhv")).toBe("hv");
    expect(openRaModFor("ra2")).toBe("ra2");
    expect(openRaModFor("opene2140")).toBe("e2140");
    expect(openRaModFor("e2140")).toBe("e2140");
    expect(openRaModFor("earth-2140-trilogy")).toBe("e2140");
  });

  it("only shows the stock mod picker on Official", () => {
    expect(openRaEditionAllowsStockModPicker(null)).toBe(true);
    expect(openRaEditionAllowsStockModPicker("")).toBe(true);
    expect(openRaEditionAllowsStockModPicker("official")).toBe(true);
    expect(openRaEditionAllowsStockModPicker("combined-arms")).toBe(false);
    expect(openRaEditionAllowsStockModPicker("ra2")).toBe(false);
    expect(openRaEditionAllowsStockModPicker("tiberian-dawn-hd")).toBe(false);
    expect(openRaEditionAllowsStockModPicker("opene2140")).toBe(false);
  });
});

describe("agreement with the host agent", () => {
  /*
   * The agent runs on the VPS and cannot import this module, so it carries its
   * own copy of the rule. If the two ever disagree, the server starts one mod
   * and the client joins another — precisely the failure this prevents.
   */
  const AGENT = readFileSync("game-host/recipes.js", "utf8");

  it("the agent still resolves the same way", () => {
    const fn = AGENT.match(/function openRaMod\(editionSlug\)\s*\{([\s\S]*?)\n\}/);
    expect(fn, "openRaMod should exist in the agent").not.toBeNull();
    const body = fn![1];

    // Same branches, same order, same defaults.
    expect(body).toMatch(/includes\("e2140"\)/);
    expect(body).toMatch(/includes\("opene2140"\)/);
    expect(body).toMatch(/includes\("cnc"\)/);
    expect(body).toMatch(/includes\("tiberian"\)/);
    expect(body).toMatch(/=== "td"/);
    expect(body).toMatch(/includes\("d2k"\)/);
    expect(body).toMatch(/includes\("dune"\)/);
    expect(body).toMatch(/return "ra";/);
    expect(AGENT).toMatch(/function resolveOpenRaServerMod/);
  });

  it("keeps our copy matching the agent's tiberian quirk", () => {
    /*
     * The agent's bare `tiberian` test claims Tiberian Sun for cnc. Being more
     * correct here would resolve ts against a cnc server and reintroduce the
     * mismatch, so this asserts we stay bug-compatible until the agent is
     * redeployed.
     */
    expect(openRaModFor("tiberian-sun")).toBe("cnc");
    expect(openRaModFor("tiberian-dawn")).toBe("cnc");
  });
});
