import { describe, it, expect } from "vitest";
import { choosablePublicEditions, type EditionOption } from "@/lib/servers/editionOptions";


const mp = (slug: string, marker: string): EditionOption => ({
  slug,
  name: slug,
  visibility: "public",
  features: [marker],
});
const solo = (slug: string): EditionOption => ({
  slug,
  name: slug,
  visibility: "public",
  features: ["Singleplayer"],
});

describe("server browser edition options", () => {
  it("offers a lone multiplayer edition", () => {
    // The old rule needed two before showing anything, so a game's only
    // multiplayer edition was unreachable from the browser meant to find its
    // servers.
    const out = choosablePublicEditions([mp("multiplayer", "Multiplayer"), solo("vanilla")]);
    expect(out.map((e) => e.slug)).toEqual(["multiplayer"]);
  });

  it("drops solo editions when a multiplayer one exists", () => {
    // Picking one could only ever produce an empty server list.
    const out = choosablePublicEditions([
      solo("story"),
      mp("coop", "Co-op"),
      solo("vanilla"),
      mp("lan", "LAN support"),
    ]);
    expect(out.map((e) => e.slug).sort()).toEqual(["coop", "lan"]);
  });

  it("counts the same play modes the rest of the site does", () => {
    for (const marker of ["Co-op", "Hotseat", "LAN support", "Split-Screen", "Multiplayer"]) {
      const out = choosablePublicEditions([mp("e", marker), solo("solo")]);
      expect(out.map((e) => e.slug), `${marker} should qualify`).toEqual(["e"]);
    }
  });

  it("keeps the old behaviour when no edition declares multiplayer", () => {
    // Nothing to tell them apart by, so do not empty the dropdown on a guess.
    const untagged = [
      { slug: "a", name: "A", visibility: "public" },
      { slug: "b", name: "B", visibility: "public" },
    ];
    expect(choosablePublicEditions(untagged).map((e) => e.slug)).toEqual(["a", "b"]);
    expect(choosablePublicEditions([untagged[0]])).toEqual([]);
  });

  it("still hides virtual, hidden and unlisted editions", () => {
    const out = choosablePublicEditions([
      { ...mp("real", "Multiplayer") },
      { ...mp("ghost", "Multiplayer"), virtual: true },
      { ...mp("secret", "Multiplayer"), visibility: "hidden" },
      { ...mp("quiet", "Multiplayer"), visibility: "unlisted" },
    ]);
    expect(out.map((e) => e.slug)).toEqual(["real"]);
  });
});
