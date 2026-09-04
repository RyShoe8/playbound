import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MULTIPLAYER_ADAPTERS,
  getConnectArgsTemplate,
  getDefaultGamePort,
  getMultiplayerAdapter,
} from "@/lib/multiplayer/adapters";

/**
 * adapters.ts carries two alias maps, and both had grown entries that did
 * nothing or did the wrong thing:
 *
 *   uqm -> the-ur-quan-masters   target is not an adapter, so it resolved to
 *                                undefined exactly as an unknown slug would
 *   aleph-one -> marathon        aleph-one has its own adapter; the alias
 *   alephone  -> marathon        redirected each game away from it
 *
 * The shadowing pair was harmless only because the three configs happened to
 * be identical — the day one of them gained a port, the alias would have
 * silently overridden it. These rules catch both shapes.
 *
 * The maps are module-private, so they are read from source; the assertions
 * then go through the public lookups.
 */

const SRC = readFileSync(
  path.join(process.cwd(), "src", "lib", "multiplayer", "adapters.ts"),
  "utf8"
);

function aliasMap(name: string): Record<string, string> {
  const at = SRC.indexOf(`const ${name}: Record<string, string> = {`);
  expect(at, `${name} not found — adapters.ts has been restructured`).toBeGreaterThan(-1);
  const body = SRC.slice(SRC.indexOf("{", at) + 1, SRC.indexOf("\n};", at));
  const out: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const m = /^\s*"?([a-z0-9-]+)"?:\s*"([a-z0-9-]+)"/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  expect(Object.keys(out).length, `${name} parsed as empty`).toBeGreaterThan(0);
  return out;
}

const MAPS = {
  ADAPTER_SLUG_ALIASES: aliasMap("ADAPTER_SLUG_ALIASES"),
  SLUG_ALIASES: aliasMap("SLUG_ALIASES"),
};

describe.each(Object.entries(MAPS))("%s", (name, map) => {
  it("every alias target names a real adapter", () => {
    const broken = Object.entries(map)
      .filter(([, target]) => !MULTIPLAYER_ADAPTERS[target])
      .map(([alias, target]) => `${alias} -> ${target}`);
    expect(broken, `${name}: alias targets with no adapter`).toEqual([]);
  });

  it("no alias shadows a slug that already has its own adapter", () => {
    /*
     * An alias only belongs in these maps when the key has no adapter. If it
     * has one, the alias hides that game's own config behind another game's.
     */
    const shadowing = Object.keys(map).filter((alias) => MULTIPLAYER_ADAPTERS[alias]);
    expect(shadowing, `${name}: aliases hiding a real adapter`).toEqual([]);
  });

  it("no alias points at another alias", () => {
    // A two-hop alias resolves to nothing: the lookups substitute once.
    const chained = Object.entries(map)
      .filter(([, target]) => target in map)
      .map(([alias, target]) => `${alias} -> ${target} -> ...`);
    expect(chained, `${name}: chained aliases resolve to nothing`).toEqual([]);
  });

  it("no alias maps a slug to itself", () => {
    expect(Object.entries(map).filter(([a, t]) => a === t)).toEqual([]);
  });
});

describe("the aliases that survived still resolve", () => {
  it("SLUG_ALIASES keys reach a real adapter through the public lookups", () => {
    for (const alias of Object.keys(MAPS.SLUG_ALIASES)) {
      expect(getConnectArgsTemplate(alias), `${alias} resolved to nothing`).not.toBeUndefined();
      expect(typeof getDefaultGamePort(alias)).toBe("number");
    }
  });

  it("ADAPTER_SLUG_ALIASES keys resolve to the aliased adapter, not a stub", () => {
    for (const [alias, target] of Object.entries(MAPS.ADAPTER_SLUG_ALIASES)) {
      expect(getMultiplayerAdapter(alias).gameSlug).toBe(
        MULTIPLAYER_ADAPTERS[target]!.gameSlug
      );
    }
  });
});

describe("the specific entries removed", () => {
  it("uqm is gone, and behaves exactly as it did — unknown", () => {
    expect(getConnectArgsTemplate("uqm")).toBeUndefined();
    expect(getDefaultGamePort("uqm")).toBe(0);
  });

  it("aleph-one and alephone now resolve to their own adapters", () => {
    for (const slug of ["aleph-one", "alephone"]) {
      expect(getMultiplayerAdapter(slug).gameSlug).toBe(slug);
      // Unchanged in effect: the configs were identical to marathon's, which
      // is why removing the alias was safe.
      expect(getConnectArgsTemplate(slug)).toEqual(["-connect", "{host}:{port}"]);
      expect(getDefaultGamePort(slug)).toBe(0);
    }
  });
});
