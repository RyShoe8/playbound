import { z } from "zod";
import { PHYSICAL_BUTTON_NAMES, VK_NAMES, MOUSE_BUTTON_NAMES } from "./vocab";

/**
 * Validation for a `ControlProfile` document — see
 * src/lib/models/ControlProfile.ts for what each field means. Unlike
 * `controls/schema.ts` (the human-readable reference bindings shown on
 * `/games/[slug]/controls`), this is the machine-readable recipe the
 * launcher's Input Engine actually runs, so every binding is checked against
 * a real physical-button/virtual-key name rather than accepted as free text.
 */

const actionOutputSchema = z
  .object({
    type: z.enum(["key", "mouseButton"]),
    vk: z.enum(VK_NAMES).nullable().optional(),
    button: z.enum(MOUSE_BUTTON_NAMES).nullable().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "key" && !val.vk) {
      ctx.addIssue({ code: "custom", message: "A key output needs a vk name", path: ["vk"] });
    }
    if (val.type === "mouseButton" && !val.button) {
      ctx.addIssue({ code: "custom", message: "A mouseButton output needs a button", path: ["button"] });
    }
  });

const controlProfileActionSchema = z.object({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(80),
  output: actionOutputSchema,
});

const controlProfileBindingSchema = z.object({
  actionId: z.string().trim().min(1).max(60),
  physicalInput: z.enum(PHYSICAL_BUTTON_NAMES),
});

const controlProfileContextSchema = z.object({
  name: z.string().trim().min(1).max(60),
  trigger: z.enum(PHYSICAL_BUTTON_NAMES),
  bindings: z.array(controlProfileBindingSchema).max(30).default([]),
});

const stickMouseSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  deadzone: z.number().min(0).max(0.9).default(0.15),
  curve: z.enum(["linear", "exponential"]).default("exponential"),
  sensitivity: z.number().min(0.01).max(10).default(1.35),
  acceleration: z.number().min(0).max(0.99).default(0.35),
  smoothing: z.number().min(0).max(0.99).default(0.08),
  maxVelocity: z.number().min(1).max(5000).default(900),
  invertY: z.boolean().default(false),
  precisionMultiplier: z.number().min(0.01).max(1).default(0.4),
});

export const controlProfileSchema = z
  .object({
    gameSlug: z.string().trim().min(1).max(120),
    editionSlug: z
      .union([z.string().trim().min(1).max(120), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),

    name: z.string().trim().min(1).max(120),
    version: z.string().trim().min(1).max(40),
    platform: z.enum(["windows"]).default("windows"),
    inputStrategy: z.enum(["keyboard_mouse"]).default("keyboard_mouse"),

    actions: z.array(controlProfileActionSchema).max(40).default([]),
    bindings: z.array(controlProfileBindingSchema).max(30).default([]),
    contexts: z.array(controlProfileContextSchema).max(10).default([]),
    // Optional rather than `.default({})`: every field inside already has its
    // own zod default, and Mongoose's own schema default covers a create
    // that omits this entirely — no need for a fabricated empty object here.
    stickMouseSettings: stickMouseSettingsSchema.optional(),

    testedControllers: z.array(z.string().trim().max(80)).max(20).default([]),
    antiCheatCompatibility: z.enum(["verified", "unknown", "incompatible"]).default("unknown"),
    status: z.enum(["draft", "testing", "verified"]).default("draft"),

    notes: z
      .union([z.string().trim().max(800), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((val, ctx) => {
    const actionIds = new Set(val.actions.map((a) => a.id));

    // A binding pointing at an action that doesn't exist is silently
    // unreachable in the launcher — better to reject it at save time than
    // ship a profile with a dead binding nobody notices.
    const checkBindings = (bindings: { actionId: string }[], path: (string | number)[]) => {
      bindings.forEach((b, i) => {
        if (!actionIds.has(b.actionId)) {
          ctx.addIssue({
            code: "custom",
            message: `Binding references unknown action "${b.actionId}"`,
            path: [...path, i, "actionId"],
          });
        }
      });
    };
    checkBindings(val.bindings, ["bindings"]);
    val.contexts.forEach((c, i) => checkBindings(c.bindings, ["contexts", i, "bindings"]));

    // "verified" is the status that activates automatically for real
    // players — require it to actually be runnable rather than an empty
    // shell that would silently do nothing in-game.
    if (val.status === "verified" && val.bindings.length === 0 && val.contexts.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "A verified profile needs at least one binding",
        path: ["status"],
      });
    }
    if (val.status === "verified" && val.antiCheatCompatibility !== "verified") {
      ctx.addIssue({
        code: "custom",
        message: "Check anti-cheat compatibility before verifying a profile",
        path: ["antiCheatCompatibility"],
      });
    }
    if (val.status === "verified" && val.testedControllers.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Test with a physical controller before verifying a profile",
        path: ["testedControllers"],
      });
    }
  });

export type ControlProfileInput = z.input<typeof controlProfileSchema>;
export type ControlProfileOutput = z.output<typeof controlProfileSchema>;
