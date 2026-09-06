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
const PAGE = read("src", "app", "admin", "platform-limits", "page.tsx");

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

  it("refuses a party cap below two", () => {
    // A party of one is not a party, and the join rules already refuse it.
    expect(ROUTE).toMatch(/partyHardCap: z\.number\(\)\.int\(\)\.min\(2\)/);
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
    expect(optional.length).toBeGreaterThanOrEqual(4);
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
    expect(EDITOR).toMatch(/Nobody will be removed/);
  });

  it("says what turning the pool off actually does", () => {
    expect(EDITOR).toMatch(/subscriptions the only route|pool is switched off/i);
  });

  it("gives the usage bar a text alternative", () => {
    // A coloured bar is the only signal here; it needs a non-visual one too.
    expect(EDITOR).toMatch(/aria-label=\{`\$\{usage\.inUse\} of \$\{usage\.pool\}/);
  });
});

describe("the page", () => {
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
