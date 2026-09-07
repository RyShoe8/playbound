import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The admin limits surface, and the properties that keep it safe to use.
 *
 * The pool is a number an admin types, and it gates whether strangers can join
 * each other's parties. So the route has to reject nonsense before it reaches
 * the database, and the screen has to show what the number means in practice
 * rather than accepting it blind.
 */

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const ROUTE = read("src", "app", "api", "admin", "platform-limits", "route.ts");
const EDITOR = read("src", "components", "admin", "PlatformLimitsEditor.tsx");
/*
 * The editor lives on the parties screen — the pool governs those parties, and
 * the usage figures are computed from them, so the setting and the thing it
 * limits are read together.
 */
const PAGE = read("src", "app", "admin", "connect", "parties", "page.tsx");
const OLD_ROUTE = read("src", "app", "admin", "platform-limits", "page.tsx");

describe("the route", () => {
  it("is admin-only on both verbs", () => {
    const guards = ROUTE.match(/requireAdminSession\(\)/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it("validates rather than coercing by hand", () => {
    // The neighbouring settings route hand-rolls min/max per field; zod keeps
    // the bounds in one place and returns a message naming the field.
    expect(ROUTE).toMatch(/limitsSchema/);
    expect(ROUTE).toMatch(/z\.ZodError/);
    expect(ROUTE).toMatch(/firstZodErrorMessage/);
  });

  it("refuses a free party size below two", () => {
    // A party of one is not a party, and the join rules already refuse it.
    expect(ROUTE).toMatch(/maxFreePartySize: z\.number\(\)\.int\(\)\.min\(2\)/);
  });

  it("exposes exactly two settings, and no more", () => {
    /*
     * Free seats and free party size. Subscribers need no setting — they are
     * bounded by what they bought plus whatever the pool has spare — and
     * party size is not something a player picks.
     */
    const fields = (ROUTE.match(/^\s{4}\w+: z\./gm) || []).length;
    expect(fields).toBe(2);
    expect(ROUTE).toMatch(/freePartySlotPool: z\.number\(\)/);
    expect(ROUTE).toMatch(/maxFreePartySize: z\.number\(\)/);
  });

  it("does not reintroduce settings nobody asked for", () => {
    for (const gone of ["maxPartySize", "defaultPartySize", "freePartyBaseline", "poolEnabled"]) {
      expect(ROUTE, `${gone} is back`).not.toMatch(new RegExp(`\b${gone}\b`));
    }
  });

  it("refuses a negative pool", () => {
    expect(ROUTE).toMatch(/freePartySlotPool: z\.number\(\)\.int\(\)\.min\(0\)/);
  });

  it("takes a partial patch, so one field cannot revert another", () => {
    /*
     * Every field optional, with an explicit refusal of the empty object. A
     * whole-document write is how a stale form silently reverts an edit
     * someone else made — the same reason the game routes are split by
     * concern.
     */
    const optional = ROUTE.match(/\.optional\(\)/g) || [];
    expect(optional.length).toBeGreaterThanOrEqual(2);
    expect(ROUTE).toMatch(/Nothing to update/);
  });

  it("writes with \\$set and upserts the singleton", () => {
    expect(ROUTE).toMatch(/\$set: patch/);
    expect(ROUTE).toMatch(/\$setOnInsert: \{ singletonKey: "default" \}/);
  });

  it("returns live usage with the settings", () => {
    // Setting a shared budget without seeing what is claimed is guesswork.
    expect(ROUTE).toMatch(/getPoolStatus\(\)/);
    expect(ROUTE).toMatch(/usage/);
  });
});

describe("the screen", () => {
  it("shows usage beside the input, not on another page", () => {
    expect(EDITOR).toMatch(/In use/);
    expect(EDITOR).toMatch(/Available/);
  });

  it("warns when the pool is set below what is already claimed", () => {
    /*
     * Allowed, and not destructive — seats are held until their member leaves
     * — but it stops new joins until usage falls back under the line. An admin
     * should not have to learn that from support tickets.
     */
    expect(EDITOR).toMatch(/const oversubscribed =/);
    expect(EDITOR).toMatch(/Nobody will be\s+removed/);
  });

  it("says the free cap binds free parties only", () => {
    // Otherwise an admin reads it as a limit on subscribers too and sets it
    // high to avoid capping paying customers, defeating the point.
    expect(EDITOR).toMatch(/without a subscription/i);
    expect(EDITOR).toMatch(/Subscribers are limited by the slots they bought/);
  });

  it("says how to turn free parties off, without a separate switch for it", () => {
    expect(EDITOR).toMatch(/Zero turns free parties off/);
  });

  it("gives the usage bar a text alternative", () => {
    // A coloured bar is the only signal here; it needs a non-visual one too.
    expect(EDITOR).toMatch(/aria-label=\{`\$\{usage\.inUse\} of \$\{usage\.pool\}/);
  });
});

describe("the page", () => {
  it("is the parties screen, with the editor on it", () => {
    expect(PAGE).toMatch(/<PlatformLimitsEditor/);
    expect(PAGE).toMatch(/<ConnectManager view="parties" \/>/);
  });

  it("the old standalone URL still lands somewhere useful", () => {
    // It was live; a bookmark should redirect rather than 404.
    expect(OLD_ROUTE).toMatch(/permanentRedirect\("\/admin\/connect\/parties"\)/);
  });

  it("is never served from a cache", () => {
    /*
     * Pool usage is live. The admin layout opts out of prerendering, but each
     * segment prerenders independently, so this page must opt out itself.
     */
    expect(PAGE).toMatch(/await connection\(\)/);
  });

  it("explains the pool is shared before showing a number", () => {
    expect(PAGE).toMatch(/shared pool|shared platform-wide/i);
  });
});
