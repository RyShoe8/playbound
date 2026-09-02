import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { HOSTABLE_GAMES } from "./catalog";
import { MULTIPLAYER_ADAPTERS, getMultiplayerAdapter } from "@/lib/multiplayer/adapters";

/**
 * A game PlayBound hosts is declared in four separate places and nothing joins
 * them at runtime, so a slug can sit in one and not the others indefinitely.
 *
 * BZFlag did exactly that: a spawn recipe, a connect line, a settings profile
 * and an apt package on the VPS — but no adapter row, so
 * `getMultiplayerAdapter` fell through to its synthetic `official` default.
 * `official` means "the game's own network stays theirs", which is the opposite
 * of provisioning rooms for it, and nothing anywhere disagreed out loud.
 *
 * The agent and the launcher are separate deployables this process cannot
 * import, so their sources are read as text. That is the point: the copies are
 * only ever checked here.
 *
 * Settings-profile coverage is deliberately not repeated — serverControl's own
 * settings.test.ts owns it, with the UNASSESSED list for games held back on
 * purpose.
 */
function source(rel: string) {
  return fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const declares = (src: string, slug: string) =>
  src.includes(`\n  ${slug}:`) || src.includes(`\n  "${slug}":`);

describe("every hostable game is declared all the way down", () => {
  const hostable = Object.keys(HOSTABLE_GAMES);

  it("has a real adapter row rather than the official fallback", () => {
    const missing = hostable.filter((slug) => {
      if (MULTIPLAYER_ADAPTERS[slug]) return false;
      // The resolver also follows aliases; 0 A.D. is `0-ad` here and `0ad` there.
      return getMultiplayerAdapter(slug).adapterType === "official";
    });
    expect(
      missing,
      `hostable with no adapter row, so Connect calls them official: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("has a spawn recipe on the agent", () => {
    const src = source("../../../game-host/recipes.js");
    const missing = hostable.filter((slug) => !declares(src, slug));
    expect(missing, `hostable with no agent recipe: ${missing.join(", ")}`).toEqual([]);
  });

  /*
   * connectArgs.js is authoritative for hosted slugs and overrides the install
   * record — but a game whose catalog row already carries connectArgs does not
   * need an entry, so absence is only a bug when nothing else supplies one. The
   * exemptions name which games those are, because a unit test cannot read the
   * production catalog.
   */
  const CONNECT_FROM_CATALOG: Record<string, string> = {
    "warzone-2100": "Its catalog record carries --join={host}:{port}.",
  };

  it("says how the client joins, even when the answer is that it cannot", () => {
    // An explicit null means "no command-line join, show them the address". An
    // absent slug means nobody decided — and for a game we provision a room
    // for, that is a room players cannot get into.
    const src = source("../../../../launcher/services/connectArgs.js");
    const missing = hostable.filter(
      (slug) => !declares(src, slug) && !CONNECT_FROM_CATALOG[slug]
    );
    expect(
      missing,
      `hostable with no connectArgs entry and no catalog fallback: ${missing.join(", ")}`
    ).toEqual([]);
  });
});
