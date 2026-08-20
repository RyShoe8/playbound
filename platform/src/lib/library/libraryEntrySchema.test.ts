import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import LibraryEntry from "@/lib/models/LibraryEntry";

/**
 * Schema-level checks for the multi-edition field, run offline via
 * validateSync() so they need no database.
 *
 * `installedEditions` was added to rows that already exist in production, so
 * what matters most is that its absence is legal — a legacy row must keep
 * validating and must not read as "nothing installed".
 */

const base = () => ({
  userId: new Types.ObjectId(),
  gameSlug: "holocure",
  platform: "desktop" as const,
  installed: true,
});

describe("installedEditions", () => {
  it("accepts several editions on one row", () => {
    const doc = new LibraryEntry({
      ...base(),
      editionSlug: "holocure-playbound",
      installedEditions: ["holocure-playbound", "official"],
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.installedEditions).toEqual(["holocure-playbound", "official"]);
  });

  it("defaults to an empty array rather than undefined", () => {
    // Readers iterate this directly; undefined would throw on legacy rows.
    const doc = new LibraryEntry(base());
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.installedEditions).toEqual([]);
  });

  it("still validates a row shaped like the old schema", () => {
    const doc = new LibraryEntry({ ...base(), editionSlug: "official" });
    expect(doc.validateSync()).toBeUndefined();
  });

  it("leaves editionSlug free to be null", () => {
    // Unlabelled installs are normal — most of the catalog has one build.
    const doc = new LibraryEntry({ ...base(), editionSlug: null });
    expect(doc.validateSync()).toBeUndefined();
  });
});
