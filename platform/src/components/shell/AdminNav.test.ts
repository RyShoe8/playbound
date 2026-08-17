import { describe, it, expect } from "vitest";
import { childrenFor, gameSlugFromPath, linkActive, links } from "./AdminNav";

/**
 * The admin nav is only reachable behind auth, so its behaviour is asserted
 * here rather than by clicking through it. What matters is which pills a route
 * produces and which single one is lit — a section that silently collapses, or
 * two highlighted pills, is the failure mode worth catching.
 */

/** Mirrors the render loop in AdminNav. */
function navFor(pathname: string) {
  const gameSlug = gameSlugFromPath(pathname);
  return links.map((item) => {
    const children = childrenFor(item, gameSlug);
    const roots = item.family ?? [item.href];
    const inSection = roots.some((root) => linkActive(pathname, root));
    const onChild = children.some((child) => child.match(pathname));
    return {
      label: item.label,
      active: linkActive(pathname, item.href, item.exact) && !onChild,
      children: inSection
        ? children.map((c) => ({ label: c.label, href: c.href, active: c.match(pathname) }))
        : [],
    };
  });
}

function section(pathname: string, label: string) {
  return navFor(pathname).find((i) => i.label === label)!;
}

/** Every lit pill anywhere in the nav, parents and children together. */
function activeLabels(pathname: string): string[] {
  const out: string[] = [];
  for (const item of navFor(pathname)) {
    if (item.active) out.push(item.label);
    for (const child of item.children) if (child.active) out.push(child.label);
  }
  return out;
}

describe("admin nav structure", () => {
  it("keeps Collections, Bugs and Versions out of the top level", () => {
    const top = links.map((l) => l.label);
    expect(top).not.toContain("Collections");
    expect(top).not.toContain("Bugs");
    expect(top).not.toContain("Versions");
    expect(top).toContain("Games");
    expect(top).toContain("Ops");
  });

  it("puts mods, editions, collections and classifications under Games", () => {
    const games = section("/admin/games", "Games");
    expect(games.children.map((c) => c.label)).toEqual([
      "Mods",
      "Editions",
      "Collections",
      "Mod Classifications",
    ]);
  });

  it("puts bugs and versions under Ops", () => {
    const ops = section("/admin/ops", "Ops");
    expect(ops.children.map((c) => c.label)).toEqual(["Bugs", "Versions"]);
    expect(ops.children.map((c) => c.href)).toEqual([
      "/admin/bugs",
      "/admin/version-issues",
    ]);
  });
});

describe("admin nav active state", () => {
  it("keeps a section open while on one of its children", () => {
    // Bugs and Versions live outside /admin/ops, so this is the case that
    // needed `family` — without it the section would close under you.
    expect(section("/admin/bugs", "Ops").children).toHaveLength(2);
    expect(section("/admin/version-issues", "Ops").children).toHaveLength(2);
    expect(section("/admin/collections", "Games").children).toHaveLength(4);
    expect(section("/admin/mods", "Games").children).toHaveLength(4);
  });

  it("lights exactly one pill per route", () => {
    for (const path of [
      "/admin",
      "/admin/games",
      "/admin/games/mods",
      "/admin/games/editions",
      "/admin/games/mod-classifications",
      "/admin/collections",
      "/admin/ops",
      "/admin/bugs",
      "/admin/version-issues",
      "/admin/users",
    ]) {
      expect(activeLabels(path), `for ${path}`).toHaveLength(1);
    }
  });

  it("lights the child rather than the parent when on a child", () => {
    expect(activeLabels("/admin/bugs")).toEqual(["Bugs"]);
    expect(activeLabels("/admin/version-issues")).toEqual(["Versions"]);
    expect(activeLabels("/admin/collections")).toEqual(["Collections"]);
    expect(activeLabels("/admin/games/mod-classifications")).toEqual(["Mod Classifications"]);
    expect(activeLabels("/admin/ops")).toEqual(["Ops"]);
    expect(activeLabels("/admin/games")).toEqual(["Games"]);
  });

  it("treats the /admin/mods redirect as being on Mods", () => {
    expect(activeLabels("/admin/mods")).toEqual(["Mods"]);
  });

  it("scopes Mods and Editions to the game being edited", () => {
    const games = section("/admin/games/openra/edit", "Games");
    const byLabel = Object.fromEntries(games.children.map((c) => [c.label, c.href]));
    expect(byLabel.Mods).toBe("/admin/games/openra/mods");
    expect(byLabel.Editions).toBe("/admin/games/openra/editions");
    // Section-wide entries stay global even inside a game.
    expect(byLabel.Collections).toBe("/admin/collections");
    expect(activeLabels("/admin/games/openra/edit")).toEqual(["Game Details"]);
    expect(activeLabels("/admin/games/openra/mods")).toEqual(["Mods"]);
  });

  it("does not mistake a nav route for a game slug", () => {
    expect(gameSlugFromPath("/admin/games/mods")).toBeNull();
    expect(gameSlugFromPath("/admin/games/editions")).toBeNull();
    expect(gameSlugFromPath("/admin/games/mod-classifications")).toBeNull();
    expect(gameSlugFromPath("/admin/games/new")).toBeNull();
    expect(gameSlugFromPath("/admin/games/openra/edit")).toBe("openra");
  });

  it("leaves unrelated sections closed", () => {
    expect(section("/admin/users", "Games").children).toEqual([]);
    expect(section("/admin/users", "Ops").children).toEqual([]);
  });
});
