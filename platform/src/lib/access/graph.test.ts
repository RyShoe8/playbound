import { describe, expect, it } from "vitest";
import { eventDependencies } from "./graph";

describe("event access dependencies", () => {
  it("resolves legacy OpenMOHAA event slugs to the catalog edition", () => {
    expect(eventDependencies("openmohaa", "openmohaa"))
      .toEqual(["edition:medal-of-honor-allied-assault:openmohaa"]);
  });

  it("keeps base-game events on their catalog game", () => {
    expect(eventDependencies("deus-ex", ""))
      .toEqual(["game:deus-ex-goty-edition"]);
  });
});
