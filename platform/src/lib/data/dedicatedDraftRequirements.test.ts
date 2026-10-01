import { describe, expect, it } from "vitest";
import { gamePayloadSchema, installStepSchema } from "@/lib/gamePayload";
import { DEDICATED_DRAFT_EDITORIAL } from "./dedicatedDraftEditorial";
import { DEDICATED_DRAFT_REQUIREMENTS } from "./dedicatedDraftRequirements";

const slugs = [
  "battlefield-1942-anthology", "counter-strike-source", "factorio", "necesse",
  "dont-starve-together", "barotrauma", "stardew-valley", "aneurism-iv",
  "risk-of-rain-2", "starbound", "terraria", "vintage-story", "core-keeper",
  "rimworld", "unturned",
];

describe("Dedicated draft installation and hardware data", () => {
  it("covers exactly the fifteen named drafts with sourced, schema-valid requirements", () => {
    expect(Object.keys(DEDICATED_DRAFT_REQUIREMENTS).sort()).toEqual([...slugs].sort());
    for (const slug of slugs) {
      const data = DEDICATED_DRAFT_REQUIREMENTS[slug];
      expect(gamePayloadSchema.shape.systemRequirements.safeParse(data.systemRequirements).success, slug).toBe(true);
      expect(gamePayloadSchema.shape.hardwareRequirements.safeParse(data.hardwareRequirements).success, slug).toBe(true);
      expect(data.hardwareRequirements.provenance.sourceUrl).toMatch(/^https:\/\//);
      expect(data.hardwareRequirements.min).not.toEqual({});
      expect(data.hardwareRequirements.provenance.verifiedAt, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data.systemRequirements.min.trim().length, `${slug}: minimum breakdown`).toBeGreaterThan(40);
      expect(data.systemRequirements.recommended.trim().length, `${slug}: recommended breakdown or explicit gap`).toBeGreaterThan(25);
      expect(typeof data.hardwareRequirements.min.cpuText, `${slug}: sourced CPU`).toBe("string");
      expect(typeof data.hardwareRequirements.min.ramMB, `${slug}: sourced RAM`).toBe("number");
      if (!data.hardwareRequirements.recommended) {
        expect(data.systemRequirements.recommended, `${slug}: explain unpublished recommendation`).toMatch(/no separate|does not publish/i);
      }
      const supported = (DEDICATED_DRAFT_EDITORIAL[slug].platforms as string[])
        .map((platform) => platform === "macOS" ? "macos" : platform.toLowerCase());
      expect(data.hardwareRequirements.min.os, slug).toEqual(supported);
      if (supported.length > 1) {
        const apis = data.hardwareRequirements.min.apis as string[] | undefined;
        expect(apis?.some((api) => api.startsWith("dx")) ?? false,
          `${slug}: Windows-only DirectX requirement must stay in text`).toBe(false);
      }
    }
  });

  it("gives every supported platform an install instruction", () => {
    for (const slug of slugs) {
      const game = DEDICATED_DRAFT_EDITORIAL[slug];
      const steps = game.installSteps as { platform: string; text: string }[];
      const supported = game.platforms as string[];
      expect(steps.length, slug).toBeGreaterThan(0);
      for (const step of steps) expect(installStepSchema.safeParse(step).success, slug).toBe(true);
      for (const platform of supported) {
        const key = platform === "macOS" ? "macos" : platform.toLowerCase();
        expect(steps.some((step) => step.platform === key), `${slug}/${key}`).toBe(true);
      }
      expect(game.access, slug).toBeUndefined();
      expect(game.price, slug).toBeUndefined();
    }
  });
});
