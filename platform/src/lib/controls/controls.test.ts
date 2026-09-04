import { describe, expect, it } from "vitest";
import { gameControlsSchema } from "@/lib/controls/schema";
import {
  documentedSchemes,
  groupBindings,
  hasControls,
  type GameControls,
} from "@/lib/controls/types";

/**
 * The rules that keep a controls page honest.
 *
 * The risk with this feature is not a broken table — it is publishing bindings
 * nobody checked. A wiki's guess rendered on our domain becomes our claim, and
 * a reader who remaps their game because of it has been misled by us. So the
 * schema refuses bindings with no provenance, and the page refuses to exist
 * without bindings.
 */

const KEYBOARD = {
  scheme: "keyboard" as const,
  supported: true,
  bindings: [
    { action: "Move forward", input: "W", group: "Movement" as const },
    { action: "Attack", input: "Left Mouse", group: "Combat" as const },
  ],
  sourceUrl: "https://example.com/controls",
  sourceLabel: "Official manual",
};

describe("provenance", () => {
  it("refuses bindings with no source and no verification", () => {
    const r = gameControlsSchema.safeParse({
      schemes: [{ ...KEYBOARD, sourceUrl: undefined, sourceLabel: undefined }],
    });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toMatch(/source URL, or must be marked verified/);
  });

  it("accepts bindings we verified ourselves, with no external source", () => {
    // How the launcher's own controller findings get published: nobody wrote
    // them down anywhere else, we established them against the game.
    const r = gameControlsSchema.safeParse({
      schemes: [{ ...KEYBOARD, sourceUrl: undefined, sourceLabel: undefined, verified: true }],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a source URL without verification", () => {
    expect(gameControlsSchema.safeParse({ schemes: [KEYBOARD] }).success).toBe(true);
  });

  it("rejects a source that is not a URL", () => {
    const r = gameControlsSchema.safeParse({
      schemes: [{ ...KEYBOARD, sourceUrl: "the official wiki" }],
    });
    expect(r.success).toBe(false);
  });

  it("lets a notes-only scheme through without a source", () => {
    /*
     * "The D-pad is not read by this game" is our finding, not a quotation,
     * and it is worth saying even with no bindings to attach it to.
     */
    const r = gameControlsSchema.safeParse({
      schemes: [
        {
          scheme: "controller",
          supported: true,
          bindings: [],
          notes: "The D-pad is not read by this game; the left stick moves menus.",
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("internal consistency", () => {
  it("refuses a scheme that is unsupported but lists bindings", () => {
    const r = gameControlsSchema.safeParse({
      schemes: [{ ...KEYBOARD, supported: false }],
    });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toMatch(/unsupported cannot list bindings/);
  });

  it("refuses the same scheme twice", () => {
    const r = gameControlsSchema.safeParse({ schemes: [KEYBOARD, { ...KEYBOARD }] });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0].message).toMatch(/Duplicate scheme/);
  });

  it("refuses a binding with no action or no input", () => {
    for (const bad of [{ action: "", input: "W" }, { action: "Move", input: "" }]) {
      const r = gameControlsSchema.safeParse({
        schemes: [{ ...KEYBOARD, bindings: [bad] }],
      });
      expect(r.success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("the read shape round-trips", () => {
  it("accepts nulls the way Mongo returns them", () => {
    // The launcher-install schema did not, and its own API could not PATCH
    // back a document it had just served.
    const r = gameControlsSchema.safeParse({
      schemes: [
        {
          scheme: "keyboard",
          supported: true,
          bindings: [{ action: "Move", input: "W", group: null, note: null }],
          notes: null,
          sourceUrl: "https://example.com/x",
          sourceLabel: null,
          verified: null,
        },
      ],
      notes: null,
    });
    expect(r.success ? null : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toBeNull();
  });

  it("parse is a fixed point", () => {
    const once = gameControlsSchema.parse({ schemes: [KEYBOARD] });
    expect(gameControlsSchema.parse(once)).toEqual(once);
  });
});

describe("what the page shows", () => {
  const controls: GameControls = {
    schemes: [
      { scheme: "controller", supported: true, bindings: [{ action: "Jump", input: "A" }] },
      { scheme: "keyboard", supported: true, bindings: [{ action: "Jump", input: "Space" }] },
    ],
  };

  it("orders schemes keyboard first, whatever order they were stored in", () => {
    expect(documentedSchemes(controls).map((s) => s.scheme)).toEqual(["keyboard", "controller"]);
  });

  it("hasControls is false until something is actually documented", () => {
    expect(hasControls(null)).toBe(false);
    expect(hasControls(undefined)).toBe(false);
    expect(hasControls({ schemes: [] })).toBe(false);
    expect(hasControls({ schemes: [{ scheme: "keyboard", supported: true, bindings: [] }] })).toBe(false);
    expect(hasControls(controls)).toBe(true);
  });

  it("a notes-only scheme shows, but does not make the page exist on its own", () => {
    const notesOnly: GameControls = {
      schemes: [{ scheme: "controller", supported: false, bindings: [], notes: "No pad support." }],
    };
    expect(documentedSchemes(notesOnly)).toHaveLength(1);
    expect(hasControls(notesOnly)).toBe(false);
  });

  it("groups bindings in the declared order, not the order they were entered", () => {
    const grouped = groupBindings([
      { action: "Open map", input: "M", group: "Interface" },
      { action: "Attack", input: "LMB", group: "Combat" },
      { action: "Forward", input: "W", group: "Movement" },
    ]);
    expect(grouped.map((g) => g.group)).toEqual(["Movement", "Combat", "Interface"]);
  });

  it("an ungrouped binding falls into Other rather than vanishing", () => {
    const grouped = groupBindings([{ action: "Screenshot", input: "F12" }]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].group).toBe("Other");
    expect(grouped[0].bindings[0].action).toBe("Screenshot");
  });
});
