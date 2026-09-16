import { describe, expect, it } from "vitest";
import { preferredPartyEditionSlug } from "./partyEdition";

const freedoom = [
  { slug: "gzdoom", isDefault: false, features: ["Singleplayer", "Deathmatch"] },
  { slug: "zandronum", isDefault: true, features: ["Singleplayer", "Multiplayer"] },
  { slug: "dsda-doom", isDefault: false, features: ["Singleplayer", "Speedrunning"] },
];

const morrowind = [
  { slug: "openmw", isDefault: true, features: ["Singleplayer"] },
  { slug: "tes3mp", isDefault: false, features: ["Multiplayer", "Dedicated Servers", "Co-op"] },
  { slug: "classic-goty", isDefault: false, features: ["Singleplayer"] },
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

  it("requires TES3MP for Morrowind parties instead of OpenMW", () => {
    expect(preferredPartyEditionSlug(morrowind, "openmw", "morrowind")).toBe("tes3mp");
    expect(preferredPartyEditionSlug(morrowind, "tes3mp", "morrowind")).toBe("tes3mp");
  });

  it("does not lock a single-edition game", () => {
    expect(preferredPartyEditionSlug([freedoom[0]], "gzdoom")).toBeNull();
  });
});
