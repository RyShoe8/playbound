import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodFieldError } from "./zodFieldError";
import { editionPayloadSchema } from "./editionPayload";

/**
 * Validation errors have to name the field.
 *
 * Returning `issues[0].message` alone gave "Must be a full http:// or https://
 * URL" with nothing saying which URL — and because the schema validates every
 * install-method block rather than only the selected one, the offending field
 * is regularly one the editor is not looking at.
 */

function errorFor(schema: z.ZodTypeAny, value: unknown): string {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("expected a validation failure");
  return zodFieldError(result.error);
}

describe("naming the field", () => {
  it("prefixes the path", () => {
    const schema = z.object({ website: z.string().url("Must be a URL") });
    expect(errorFor(schema, { website: "nope" })).toBe("website: Must be a URL");
  });

  it("renders nested paths with dots", () => {
    const schema = z.object({
      installConfig: z.object({
        official_download: z.object({ url: z.string().url("Must be a URL") }),
      }),
    });
    expect(
      errorFor(schema, { installConfig: { official_download: { url: "x" } } })
    ).toBe("installConfig.official_download.url: Must be a URL");
  });

  it("renders array indexes as brackets", () => {
    const schema = z.object({ faq: z.array(z.object({ q: z.string().min(1, "Required") })) });
    expect(errorFor(schema, { faq: [{ q: "ok" }, { q: "" }] })).toBe("faq[1].q: Required");
  });

  it("says how many other problems there are", () => {
    // One at a time turns a bad save into a guessing game.
    const schema = z.object({ a: z.string().min(1, "Required"), b: z.string().min(1, "Required") });
    expect(errorFor(schema, { a: "", b: "" })).toMatch(/and 1 more/);
  });

  it("falls back cleanly when an issue has no path", () => {
    const schema = z.string().min(3, "Too short");
    expect(errorFor(schema, "x")).toBe("Too short");
  });
});

describe("the real edition payload", () => {
  const base = {
    gameSlug: "holocure",
    slug: "official",
    name: "Official Vanilla Edition",
    type: "official",
    status: "active",
    visibility: "public",
    installMethod: "playbound_installer",
  };

  it("points at the stale block, not the one being edited", () => {
    /*
     * The reported bug. The edition is on playbound_installer with a perfectly
     * good URL, but an old official_download block left over from before the
     * switch still carries a non-URL — and that is what fails the save.
     */
    const message = errorFor(editionPayloadSchema, {
      ...base,
      installConfig: {
        playbound_installer: {
          kind: "direct-zip",
          url: "https://mirror.playbound.club/games/holocure/HoloCure.zip",
        },
        official_download: { url: "kay-yu.itch.io/holocure" },
      },
    });
    expect(message).toContain("official_download");
    expect(message).toContain("Must be a full http:// or https:// URL");
  });

  it("accepts the edition once the stale block is cleared", () => {
    const result = editionPayloadSchema.safeParse({
      ...base,
      installConfig: {
        playbound_installer: {
          kind: "direct-zip",
          url: "https://mirror.playbound.club/games/holocure/HoloCure.zip",
        },
        official_download: { url: "" },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("edition artwork paths", () => {
  const base = {
    gameSlug: "holocure",
    slug: "playbound",
    name: "HoloCure: Multiplayer",
    type: "community",
    status: "active",
    visibility: "public",
    installMethod: "playbound_installer",
    // Required by the schema when this method is selected; without it the
    // save fails on installConfig and never reaches the branding check.
    installConfig: {
      playbound_installer: {
        kind: "direct-zip",
        url: "https://mirror.playbound.club/games/holocure/HoloCure.zip",
      },
    },
  };

  it("accepts artwork served from public/", () => {
    /*
     * The reported failure. This exact path ships with the HoloCure PlayBound
     * edition and the file really is at public/games/holocure/editions/, so
     * demanding an absolute URL made the edition unsaveable.
     */
    const result = editionPayloadSchema.safeParse({
      ...base,
      branding: { heroImage: "/games/holocure/editions/playbound.jpg" },
    });
    expect(result.success).toBe(true);
  });

  it("still accepts an absolute URL", () => {
    const result = editionPayloadSchema.safeParse({
      ...base,
      branding: { heroImage: "https://example.com/a.jpg" },
    });
    expect(result.success).toBe(true);
  });

  it("still rejects a bare domain", () => {
    // Would render as a broken relative link rather than going anywhere.
    expect(
      errorFor(editionPayloadSchema, {
        ...base,
        branding: { heroImage: "kay-yu.itch.io/holocure.jpg" },
      })
    ).toContain("branding.heroImage");
  });

  it("still rejects a protocol-relative URL", () => {
    expect(
      errorFor(editionPayloadSchema, {
        ...base,
        branding: { heroImage: "//cdn.example.com/a.jpg" },
      })
    ).toContain("branding.heroImage");
  });

  it("keeps links absolute — a site path is not a website", () => {
    expect(
      errorFor(editionPayloadSchema, { ...base, links: { website: "/somewhere" } })
    ).toContain("links.website");
  });
});
