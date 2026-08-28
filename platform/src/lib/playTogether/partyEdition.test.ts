import { describe, expect, it } from "vitest";
import { preferredPartyEditionSlug } from "./partyEdition";

const freedoom = [
  { slug: "gzdoom", isDefault: false, features: ["Singleplayer", "Deathmatch"] },
  { slug: "zandronum", isDefault: true, features: ["Singleplayer", "Multiplayer"] },
  { slug: "dsda-doom", isDefault: false, features: ["Singleplayer", "Speedrunning"] },
];

describe("preferredPartyEditionSlug", () => {
  it("repairs a stale singleplayer party edition", () => {
    expect(preferredPartyEditionSlug(freedoom, "gzdoom", "freedoom")).toBe("zandronum");
  });

  it("keeps an existing multiplayer party edition", () => {
    expect(preferredPartyEditionSlug(freedoom, "zandronum", "freedoom")).toBe("zandronum");
  });

  it("requires Zandronum even when stale database metadata has no Multiplayer tag", () => {
    const staleFreedoom = freedoom.map((edition) => ({
      ...edition,
      isDefault: edition.slug === "gzdoom",
      features: ["Singleplayer"],
    }));
    expect(preferredPartyEditionSlug(staleFreedoom, "gzdoom", "freedoom")).toBe("zandronum");
  });

  it("does not lock a single-edition game", () => {
    expect(preferredPartyEditionSlug([freedoom[0]], "gzdoom")).toBeNull();
  });
});
