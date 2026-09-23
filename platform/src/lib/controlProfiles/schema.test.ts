import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { controlProfileSchema } from "./schema";

/**
 * `ControlProfile` is the machine-readable recipe the launcher's Input
 * Engine actually runs — unlike the human-readable `controls/schema.ts`
 * block, a bad value here doesn't just render wrong, it silently does
 * nothing (or the wrong thing) in a real game. These checks protect the two
 * failure modes worth catching at save time.
 */

function baseProfile() {
  return {
    gameSlug: "dune-legacy",
    name: "PlayBound Recommended",
    version: "1.0.0",
    actions: [{ id: "interact", label: "Interact", output: { type: "key", vk: "E" } }],
    bindings: [{ actionId: "interact", physicalInput: "A" }],
  };
}

describe("controlProfileSchema", () => {
  it("accepts the OutRun pilot with mouse movement disabled", () => {
    const pilot = JSON.parse(readFileSync(join(process.cwd(), "../launcher/services/inputEngine/profiles/outrun.json"), "utf8"));
    const result = controlProfileSchema.parse(pilot);
    expect(result.status).toBe("testing");
    expect(result.stickMouseSettings?.enabled).toBe(false);
    expect(result.bindings).toHaveLength(12);
    expect(result.bindings.some((binding) => binding.physicalInput === "A")).toBe(false);
  });
  it("accepts a minimal valid profile", () => {
    const result = controlProfileSchema.safeParse(baseProfile());
    expect(result.success).toBe(true);
  });

  it("rejects a binding that references an action id which doesn't exist", () => {
    const profile = baseProfile();
    profile.bindings = [{ actionId: "doesNotExist", physicalInput: "A" }];
    const result = controlProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown physical button name", () => {
    const profile = baseProfile();
    profile.bindings = [{ actionId: "interact", physicalInput: "TRIGGER_9" }];
    const result = controlProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown virtual-key name in a key output", () => {
    const profile = baseProfile();
    profile.actions[0].output = { type: "key", vk: "NotARealKey" };
    const result = controlProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("requires a mouseButton output to name a button", () => {
    const profile = baseProfile();
    // @ts-expect-error deliberately missing vk/button for schema validation
    profile.actions[0].output = { type: "mouseButton" };
    const result = controlProfileSchema.safeParse(profile);
    expect(result.success).toBe(false);
  });

  it("rejects a verified profile with no bindings or contexts — it would silently do nothing in-game", () => {
    const profile = baseProfile();
    profile.bindings = [];
    const result = controlProfileSchema.safeParse({ ...profile, status: "verified", antiCheatCompatibility: "verified" });
    expect(result.success).toBe(false);
  });

  it("accepts a verified profile whose only bindings live inside a context", () => {
    const profile = baseProfile();
    profile.bindings = [];
    const withContext = {
      ...profile,
      status: "verified",
      antiCheatCompatibility: "verified",
      testedControllers: ["Xbox Wireless Controller"],
      contexts: [
        {
          name: "menu",
          trigger: "LB",
          bindings: [{ actionId: "interact", physicalInput: "A" }],
        },
      ],
    };
    const result = controlProfileSchema.safeParse(withContext);
    expect(result.success).toBe(true);
  });

  it("does not publish an untested or anti-cheat-unknown profile", () => {
    expect(controlProfileSchema.safeParse({ ...baseProfile(), status: "verified" }).success).toBe(false);
    expect(controlProfileSchema.safeParse({ ...baseProfile(), status: "verified", antiCheatCompatibility: "verified" }).success).toBe(false);
  });

  it("rejects a context binding that references an unknown action, same as a base binding", () => {
    const profile = baseProfile();
    const withBadContext = {
      ...profile,
      contexts: [
        {
          name: "menu",
          trigger: "LB",
          bindings: [{ actionId: "ghost", physicalInput: "A" }],
        },
      ],
    };
    const result = controlProfileSchema.safeParse(withBadContext);
    expect(result.success).toBe(false);
  });

  it("defaults platform, inputStrategy and status when omitted", () => {
    const result = controlProfileSchema.parse(baseProfile());
    expect(result.platform).toBe("windows");
    expect(result.inputStrategy).toBe("keyboard_mouse");
    expect(result.status).toBe("draft");
  });

  it("accepts left-stick movement and analog triggers as physical inputs", () => {
    const result = controlProfileSchema.safeParse({
      ...baseProfile(),
      bindings: [{ actionId: "interact", physicalInput: "LEFT_UP" }, { actionId: "interact", physicalInput: "RT" }],
    });
    expect(result.success).toBe(true);
  });
});
