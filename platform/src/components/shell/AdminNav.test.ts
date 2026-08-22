import { describe, it, expect } from "vitest";
import {
  activeSection,
  childrenFor,
  gameSlugFromPath,
  inSection,
  links,
} from "./AdminNav";

/**
 * The admin nav is only reachable behind auth, so its behaviour is asserted
 * here rather than by clicking through it.
 *
 * The shape that matters: one stable top row of sections, and a second row
 * carrying only the current section's children. Children leaking into the top
 * row is the regression this guards — that is what it did before.
 */

/** What the top row renders for a route. */
function topRow(pathname: string) {
  return links.map((item) => ({
    label: item.label,
    active: inSection(pathname, item),
  }));
}

/** What the second row renders, or null when there is no subnav. */
function subRow(pathname: string) {
  const section = activeSection(pathname, gameSlugFromPath(pathname));
  if (!section) return null;
  return {
    section: section.item.label,
    children: section.children.map((c) => ({
      label: c.label,
      href: c.href,
      active: c.match(pathname),
    })),
  };
}

describe("admin nav structure", () => {
  it("keeps the regrouped items out of the top row", () => {
    const top = links.map((l) => l.label);
    expect(top).not.toContain("Collections");
    expect(top).not.toContain("Bugs");
    expect(top).not.toContain("Versions");
    expect(top).not.toContain("Download Mirrors");
    expect(top).not.toContain("Mods");
    expect(top).not.toContain("Editions");
    expect(top).not.toContain("Free Offers");
    expect(top).not.toContain("Stores");
    expect(top).not.toContain("Game Servers");
    expect(top).toContain("Games");
    expect(top).toContain("Ops");
    expect(top).toContain("eCommerce");
  });

  it("keeps the top row identical on every route", () => {
    // A section opening must not add, remove or reorder top-row entries.
    const baseline = topRow("/admin/users").map((i) => i.label);
    for (const path of [
      "/admin",
      "/admin/games",
      "/admin/games/mods",
      "/admin/collections",
      "/admin/ops",
      "/admin/bugs",
      "/admin/download-mirrors",
      "/admin/games/openra/edit",
      "/admin/ecommerce",
      "/admin/ecommerce/stores",
      "/admin/free-offers",
      "/admin/connect",
      "/admin/connect/game-servers",
      "/admin/game-servers",
    ]) {
      expect(topRow(path).map((i) => i.label), `for ${path}`).toEqual(baseline);
    }
  });

  it("puts mods, editions, collections and classifications under Games", () => {
    expect(subRow("/admin/games")).toMatchObject({
      section: "Games",
      children: [
        { label: "Mods" },
        { label: "Editions" },
        { label: "Collections" },
        { label: "Mod Classifications" },
      ],
    });
  });

  it("puts stores and free offers under eCommerce", () => {
    expect(subRow("/admin/ecommerce")).toMatchObject({
      section: "eCommerce",
      children: [
        { label: "Overview", href: "/admin/ecommerce" },
        { label: "Stores", href: "/admin/ecommerce/stores" },
        { label: "Free Offers", href: "/admin/free-offers" },
      ],
    });
  });

  it("puts game servers under Connect", () => {
    expect(subRow("/admin/connect/game-servers")).toMatchObject({
      section: "Connect",
      children: [{ label: "Game Servers", href: "/admin/connect/game-servers" }],
    });
  });

  it("puts bugs, versions and download mirrors under Ops", () => {
    expect(subRow("/admin/ops")).toMatchObject({
      section: "Ops",
      children: [
        { label: "Bugs", href: "/admin/bugs" },
        { label: "Versions", href: "/admin/version-issues" },
        { label: "Access Audit", href: "/admin/access-audit" },
        { label: "Download Mirrors", href: "/admin/download-mirrors" },
      ],
    });
  });
});

describe("admin nav active state", () => {
  it("shows no second row outside a section that has one", () => {
    expect(subRow("/admin")).toBeNull();
    expect(subRow("/admin/users")).toBeNull();
    expect(subRow("/admin/gear")).toBeNull();
  });

  it("keeps eCommerce open on Free Offers", () => {
    expect(subRow("/admin/free-offers")?.section).toBe("eCommerce");
    expect(subRow("/admin/ecommerce/stores")?.section).toBe("eCommerce");
  });

  it("keeps the section open while on one of its children", () => {
    // Bugs, Versions and Download Mirrors all live outside /admin/ops, which
    // is why the section needs `family` — otherwise the row would vanish the
    // moment you clicked into one.
    for (const path of ["/admin/bugs", "/admin/version-issues", "/admin/download-mirrors"]) {
      expect(subRow(path)?.section, `for ${path}`).toBe("Ops");
    }
    for (const path of ["/admin/collections", "/admin/mods", "/admin/games/editions"]) {
      expect(subRow(path)?.section, `for ${path}`).toBe("Games");
    }
  });

  it("lights the section in the top row and the page in the second", () => {
    const lit = (path: string) => ({
      top: topRow(path).filter((i) => i.active).map((i) => i.label),
      sub: (subRow(path)?.children ?? []).filter((c) => c.active).map((c) => c.label),
    });

    expect(lit("/admin/bugs")).toEqual({ top: ["Ops"], sub: ["Bugs"] });
    expect(lit("/admin/download-mirrors")).toEqual({ top: ["Ops"], sub: ["Download Mirrors"] });
    expect(lit("/admin/collections")).toEqual({ top: ["Games"], sub: ["Collections"] });
    // On the section root itself, nothing in the second row is current.
    expect(lit("/admin/ops")).toEqual({ top: ["Ops"], sub: [] });
    expect(lit("/admin/games")).toEqual({ top: ["Games"], sub: [] });
    expect(lit("/admin/free-offers")).toEqual({ top: ["eCommerce"], sub: ["Free Offers"] });
    expect(lit("/admin/ecommerce/stores")).toEqual({ top: ["eCommerce"], sub: ["Stores"] });
    expect(lit("/admin/ecommerce")).toEqual({ top: ["eCommerce"], sub: ["Overview"] });
    expect(lit("/admin/connect/game-servers")).toEqual({ top: ["Connect"], sub: ["Game Servers"] });
  });

  it("lights exactly one top-row section per route", () => {
    for (const path of [
      "/admin",
      "/admin/games",
      "/admin/games/mods",
      "/admin/collections",
      "/admin/ops",
      "/admin/bugs",
      "/admin/version-issues",
      "/admin/download-mirrors",
      "/admin/users",
      "/admin/ecommerce",
      "/admin/free-offers",
    ]) {
      expect(topRow(path).filter((i) => i.active), `for ${path}`).toHaveLength(1);
    }
  });

  it("treats the /admin/mods redirect as being on Mods", () => {
    const row = subRow("/admin/mods");
    expect(row?.section).toBe("Games");
    expect(row?.children.filter((c) => c.active).map((c) => c.label)).toEqual(["Mods"]);
  });

  it("scopes Mods and Editions to the game being edited", () => {
    const row = subRow("/admin/games/openra/edit");
    const byLabel = Object.fromEntries((row?.children ?? []).map((c) => [c.label, c.href]));
    expect(byLabel.Mods).toBe("/admin/games/openra/mods");
    expect(byLabel.Editions).toBe("/admin/games/openra/editions");
    // Section-wide entries stay global even inside a game.
    expect(byLabel.Collections).toBe("/admin/collections");
    expect(row?.children.filter((c) => c.active).map((c) => c.label)).toEqual(["Game Details"]);
  });

  it("does not mistake a nav route for a game slug", () => {
    expect(gameSlugFromPath("/admin/games/mods")).toBeNull();
    expect(gameSlugFromPath("/admin/games/editions")).toBeNull();
    expect(gameSlugFromPath("/admin/games/mod-classifications")).toBeNull();
    expect(gameSlugFromPath("/admin/games/new")).toBeNull();
    expect(gameSlugFromPath("/admin/games/openra/edit")).toBe("openra");
  });

  it("gives Dashboard no subnav despite /admin prefixing everything", () => {
    // `exact` keeps Dashboard from claiming every admin route as its own.
    expect(topRow("/admin/ops").find((i) => i.label === "Dashboard")?.active).toBe(false);
    expect(childrenFor(links[0], null)).toEqual([]);
  });
});
