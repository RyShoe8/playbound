import { describe, it, expect } from "vitest";
import { normalizeTitle, offersMatch } from "./matching";

describe("freeOffers matching", () => {
  it("normalizes titles for comparison", () => {
    expect(normalizeTitle("Cyberpunk 2077: Phantom Liberty™")).toBe("cyberpunk 2077 phantom liberty");
    expect(normalizeTitle("  The Witcher 3: Wild Hunt - Game of the Year Edition (PC)  ")).toBe(
      "the witcher 3 wild hunt game of the year edition pc"
    );
    expect(normalizeTitle("S.T.A.L.K.E.R. 2: Heart of Chornobyl")).toBe(
      "s t a l k e r 2 heart of chornobyl"
    );
  });

  it("checks if two offers match for idempotency", () => {
    expect(
      offersMatch(
        { store: "epic", externalId: "offer-123" },
        { store: "epic", externalId: "offer-123" }
      )
    ).toBe(true);

    expect(
      offersMatch(
        { store: "epic", externalId: "offer-123" },
        { store: "steam", externalId: "offer-123" }
      )
    ).toBe(false);

    expect(
      offersMatch(
        { store: "epic", externalId: "offer-123" },
        { store: "epic", externalId: "offer-456" }
      )
    ).toBe(false);
  });
});
