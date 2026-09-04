import { z } from "zod";
import { CONTROL_GROUPS, CONTROL_SCHEMES } from "./types";

/**
 * Validation for the controls block.
 *
 * Deliberately tolerant of null on every optional field. The launcher-install
 * schema was not, and the result was an API whose own read shape it rejected:
 * fetch a game, change one thing, PATCH it back, and the save failed on a
 * field the caller never touched. Mongo returns an unset path as null, so
 * accepting null here is what makes read-modify-write work.
 */

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : undefined));

export const controlBindingSchema = z.object({
  action: z.string().trim().min(1, "Every binding needs an action").max(80),
  input: z.string().trim().min(1, "Every binding needs an input").max(80),
  group: z
    .union([z.enum(CONTROL_GROUPS), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : undefined)),
  note: optionalText(200),
});

export const controlSchemeBlockSchema = z
  .object({
    scheme: z.enum(CONTROL_SCHEMES),
    supported: z.boolean().default(true),
    bindings: z.array(controlBindingSchema).max(200).default([]),
    notes: optionalText(600),
    sourceUrl: z
      .union([z.string().trim().url("Source must be a URL").max(500), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v ? v : undefined)),
    sourceLabel: optionalText(120),
    verified: z
      .union([z.boolean(), z.null()])
      .optional()
      .transform((v): boolean | undefined => v || undefined),
  })
  .superRefine((val, ctx) => {
    /*
     * An unsupported scheme with bindings is a contradiction, and the page
     * would render both — "not supported" above a table of what to press.
     */
    if (!val.supported && val.bindings.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "A scheme marked unsupported cannot list bindings",
        path: ["bindings"],
      });
    }
    /*
     * Bindings without a source are how a wiki's guesswork becomes our claim.
     * Notes-only entries are exempt: "the D-pad is not read by this game" is
     * our own finding, not something quoted from elsewhere.
     */
    if (val.bindings.length > 0 && !val.sourceUrl && !val.verified) {
      ctx.addIssue({
        code: "custom",
        message: "Bindings need a source URL, or must be marked verified",
        path: ["sourceUrl"],
      });
    }
  });

export const gameControlsSchema = z
  .object({
    schemes: z.array(controlSchemeBlockSchema).max(CONTROL_SCHEMES.length).default([]),
    notes: optionalText(800),
  })
  .superRefine((val, ctx) => {
    const seen = new Set<string>();
    for (const s of val.schemes) {
      if (seen.has(s.scheme)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate scheme: ${s.scheme}`,
          path: ["schemes"],
        });
      }
      seen.add(s.scheme);
    }
  });

export type GameControlsInput = z.input<typeof gameControlsSchema>;
export type GameControlsOutput = z.output<typeof gameControlsSchema>;
