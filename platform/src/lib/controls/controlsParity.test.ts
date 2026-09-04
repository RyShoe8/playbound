import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CONTROL_GROUPS, CONTROL_SCHEMES, CONTROL_SCHEME_LABELS } from "@/lib/controls/types";

/**
 * The launcher and the web page render the same block, so they must agree on
 * what the values mean.
 *
 * They cannot share a module — one is an Electron renderer running plain ES
 * modules, the other is the Next app — so the vocabularies are declared twice.
 * That is exactly the shape that drifts: add a scheme here, and the launcher
 * silently sorts it to the front and labels it with its raw slug.
 *
 * This reads the real launcher file rather than a copy of it.
 */

const DETAIL = readFileSync(
  path.join(process.cwd(), "..", "launcher", "renderer", "views", "detail.js"),
  "utf8"
);

/** A `const NAME = [ ... ]` string array, read out of the launcher source. */
function arrayLiteral(name: string): string[] {
  const at = DETAIL.indexOf(`const ${name} = [`);
  expect(at, `${name} not found in the launcher detail view`).toBeGreaterThan(-1);
  const body = DETAIL.slice(DETAIL.indexOf("[", at) + 1, DETAIL.indexOf("]", at));
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** A `const NAME = { key: "value" }` map, read out of the launcher source. */
function objectLiteral(name: string): Record<string, string> {
  const at = DETAIL.indexOf(`const ${name} = {`);
  expect(at, `${name} not found in the launcher detail view`).toBeGreaterThan(-1);
  const body = DETAIL.slice(DETAIL.indexOf("{", at) + 1, DETAIL.indexOf("};", at));
  return Object.fromEntries(
    [...body.matchAll(/(\w+)\s*:\s*"([^"]*)"/g)].map((m) => [m[1], m[2]])
  );
}

describe("launcher and web agree about controls", () => {
  it("the scheme order covers every scheme, in the same order", () => {
    // The launcher sorts by indexOf in this array; a scheme missing from it
    // gets -1 and silently sorts to the top.
    expect(arrayLiteral("CONTROL_SCHEME_ORDER")).toEqual([...CONTROL_SCHEMES]);
  });

  it("the group order covers every group, in the same order", () => {
    // The launcher only renders groups present in this list, so one missing
    // here means those bindings disappear from the launcher and not the site.
    expect(arrayLiteral("CONTROL_GROUP_ORDER")).toEqual([...CONTROL_GROUPS]);
  });

  it("scheme labels match, so the two do not name the same thing differently", () => {
    expect(objectLiteral("CONTROL_SCHEME_LABELS")).toEqual(CONTROL_SCHEME_LABELS);
  });

  it("the launcher only shows the tab when there are real bindings", () => {
    /*
     * Same rule as the web page, which 404s without them: a tab that opens
     * onto "no controls documented" is worse than no tab.
     */
    expect(DETAIL).toMatch(/function hasControlBindings\(detail\)/);
    expect(DETAIL).toMatch(/hasControlBindings\(detail\) \? `<button[^`]*data-tab="controls"/);
  });

  it("the launcher escapes every field it renders", () => {
    // These come from the database and end up in innerHTML.
    const fn = DETAIL.slice(
      DETAIL.indexOf("function controlsPanelHtml("),
      DETAIL.indexOf("function getFeatureIcon(")
    );
    for (const field of ["b.action", "b.input", "b.note", "block.notes", "block.sourceUrl"]) {
      expect(fn, `${field} is interpolated unescaped`).toContain(`escapeHtml(${field})`);
    }
  });
});
