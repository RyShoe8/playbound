import { describe, expect, it } from "vitest";
import {
  BASE_EDITION_KEY,
  isBaseEditionSlug,
  libraryHasRequiredEdition,
} from "./editionMatch";

describe("isBaseEditionSlug", () => {
  it("treats empty, official, and the placeholder as the default install", () => {
    expect(isBaseEditionSlug(null)).toBe(true);
    expect(isBaseEditionSlug(undefined)).toBe(true);
    expect(isBaseEditionSlug("")).toBe(true);
    expect(isBaseEditionSlug(BASE_EDITION_KEY)).toBe(true);
    expect(isBaseEditionSlug("official")).toBe(true);
    expect(isBaseEditionSlug("Official")).toBe(true);
    expect(isBaseEditionSlug("default")).toBe(true);
  });

  it("treats a named edition as specific", () => {
    expect(isBaseEditionSlug("project-quarm")).toBe(false);
    expect(isBaseEditionSlug("multiplayer")).toBe(false);
  });
});

describe("libraryHasRequiredEdition", () => {
  it("is false when the game is not installed", () => {
    expect(libraryHasRequiredEdition([], "official")).toBe(false);
    expect(libraryHasRequiredEdition([], "project-quarm")).toBe(false);
  });

  it("counts an Official / __base__ row as matching a default party edition", () => {
    expect(libraryHasRequiredEdition([BASE_EDITION_KEY], null)).toBe(true);
    expect(libraryHasRequiredEdition(["official"], "official")).toBe(true);
    expect(libraryHasRequiredEdition([BASE_EDITION_KEY], "official")).toBe(true);
  });

  it("requires the named edition when the party is not on Official", () => {
    expect(libraryHasRequiredEdition(["official"], "project-quarm")).toBe(false);
    expect(libraryHasRequiredEdition(["project-quarm"], "project-quarm")).toBe(true);
  });
});
