import { describe, it, expect } from "vitest";
import { PLATFORM_EXPR, normalizeTelemetryPlatform } from "./failureRates";

/**
 * The platform bucket is decided by an aggregation expression, so none of the
 * tests around `buildFailureRates` touch it — they start from rows Mongo has
 * already grouped. That left the actual fix untested: the previous expression
 * was `$ifNull: ["$os", …]`, and because `parseUserAgent` stores the *string*
 * "unknown" rather than null, the fallback it existed for could never run.
 * That bug was invisible to every test in this directory.
 *
 * There is no MongoDB available here, so this evaluates the expression against
 * the documented semantics of the handful of operators it uses. That is enough
 * to catch what actually goes wrong when editing it — a mis-nested $ifNull, a
 * wrong field path, the fallbacks in the wrong order — but it is a model of
 * MongoDB, not MongoDB. It cannot catch a genuine server-side surprise.
 */

const MISSING = Symbol("missing");

function resolvePath(doc: Record<string, unknown>, path: string): unknown {
  let cur: unknown = doc;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object" || !(part in (cur as object))) return MISSING;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Null and a missing field behave identically for $ifNull. */
const nullish = (v: unknown) => v === MISSING || v === null || v === undefined;

function evaluate(
  expr: unknown,
  doc: Record<string, unknown>,
  vars: Record<string, unknown> = {}
): unknown {
  if (typeof expr === "string") {
    if (expr.startsWith("$$")) {
      const name = expr.slice(2);
      if (!(name in vars)) throw new Error(`undefined variable ${expr}`);
      return vars[name];
    }
    if (expr.startsWith("$")) return resolvePath(doc, expr.slice(1));
    return expr;
  }
  if (Array.isArray(expr)) return expr.map((e) => evaluate(e, doc, vars));
  if (expr === null || typeof expr !== "object") return expr;

  const keys = Object.keys(expr as object);
  if (keys.length !== 1) throw new Error(`expected one operator, got ${keys.join(",")}`);
  const op = keys[0];
  const arg = (expr as Record<string, unknown>)[op];

  switch (op) {
    case "$let": {
      const { vars: declared, in: body } = arg as { vars: Record<string, unknown>; in: unknown };
      const scope: Record<string, unknown> = { ...vars };
      for (const [k, v] of Object.entries(declared)) scope[k] = evaluate(v, doc, vars);
      return evaluate(body, doc, scope);
    }
    case "$ifNull": {
      const [a, b] = arg as [unknown, unknown];
      const first = evaluate(a, doc, vars);
      return nullish(first) ? evaluate(b, doc, vars) : first;
    }
    case "$cond": {
      const [c, t, f] = arg as [unknown, unknown, unknown];
      return evaluate(c, doc, vars) ? evaluate(t, doc, vars) : evaluate(f, doc, vars);
    }
    case "$in": {
      const [needle, hay] = arg as [unknown, unknown];
      const value = evaluate(needle, doc, vars);
      const list = evaluate(hay, doc, vars) as unknown[];
      return list.includes(value);
    }
    case "$eq": {
      const [a, b] = arg as [unknown, unknown];
      const left = evaluate(a, doc, vars);
      const right = evaluate(b, doc, vars);
      return (nullish(left) ? null : left) === (nullish(right) ? null : right);
    }
    // $toString on null/missing yields null; $toLower on null yields "".
    case "$toString": {
      const v = evaluate(arg, doc, vars);
      return nullish(v) ? null : String(v);
    }
    case "$toLower": {
      const v = evaluate(arg, doc, vars);
      return nullish(v) ? "" : String(v).toLowerCase();
    }
    default:
      throw new Error(`unsupported operator ${op}`);
  }
}

/** What the card ends up showing for a stored event. */
function bucket(doc: Record<string, unknown>): string {
  return normalizeTelemetryPlatform(evaluate(PLATFORM_EXPR, doc));
}

describe("the platform aggregation expression", () => {
  it("uses os when the User-Agent gave one", () => {
    expect(bucket({ os: "Windows", properties: {} })).toBe("Windows");
    expect(bucket({ os: "macOS", properties: {} })).toBe("macOS");
    expect(bucket({ os: "Linux", properties: {} })).toBe("Linux");
  });

  it("falls through the literal string 'unknown' to properties.platform", () => {
    // The regression. `os` is "unknown", not null, so the old $ifNull chain
    // stopped here and reported Unknown while a real platform sat one field
    // away.
    expect(bucket({ os: "unknown", properties: { platform: "macos" } })).toBe("macOS");
    expect(bucket({ os: "UNKNOWN", properties: { platform: "linux" } })).toBe("Linux");
    expect(bucket({ os: "", properties: { platform: "windows" } })).toBe("Windows");
    expect(bucket({ os: null, properties: { platform: "darwin" } })).toBe("macOS");
    expect(bucket({ properties: { platform: "linux" } })).toBe("Linux");
  });

  it("labels server-raised events Server rather than Unknown", () => {
    expect(bucket({ os: "unknown", properties: { origin: "server" } })).toBe("Server");
    // Even with no os field at all.
    expect(bucket({ properties: { origin: "server" } })).toBe("Server");
  });

  it("prefers a known platform over the server label", () => {
    // A party whose leader's OS was recorded is attributable, and that is more
    // useful than knowing the work happened server-side.
    expect(bucket({ os: "unknown", properties: { origin: "server", platform: "macos" } })).toBe(
      "macOS"
    );
  });

  it("still reports Unknown for a client event with nothing to go on", () => {
    expect(bucket({ os: "unknown", properties: {} })).toBe("Unknown");
    expect(bucket({ properties: {} })).toBe("Unknown");
    expect(bucket({ os: "unknown", properties: { platform: "unknown" } })).toBe("Unknown");
    // A non-server origin must not borrow the Server label.
    expect(bucket({ properties: { origin: "launcher" } })).toBe("Unknown");
  });

  it("does not treat a real platform as absent", () => {
    // Guards the absent() list: adding a token there that is also a real
    // platform would silently erase it.
    for (const os of ["Windows", "macOS", "Linux", "Android", "iOS", "Browser"]) {
      expect(bucket({ os, properties: {} })).not.toBe("Unknown");
      expect(bucket({ os, properties: {} })).not.toBe("Server");
    }
  });
});
