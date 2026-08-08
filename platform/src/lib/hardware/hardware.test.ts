import { describe, expect, it } from "vitest";
import { normalizeCpuName, normalizeGpuName } from "./normalize";
import { evaluateCompatibility } from "./compatibility";
import { effectiveHardwareRequirements, hasStructuredRequirements, mergeRequirementSpecs } from "./mergeRequirements";
import { tierMeets } from "./tiers";
import {
  parseFreeTextRequirementsBlock,
  parseRequirementLine,
} from "./parseFreeTextRequirements";

describe("normalizeCpuName", () => {
  it("strips trademark and frequency noise", () => {
    const n = normalizeCpuName("Intel(R) Core(TM) i5-10400 CPU @ 2.90GHz");
    expect(n.displayName).toMatch(/Intel Core i5-10400/i);
    expect(n.identityKey).toContain("i5-10400");
    expect(n.manufacturer).toBe("Intel");
  });
});

describe("normalizeGpuName", () => {
  it("normalizes NVIDIA laptop naming", () => {
    const n = normalizeGpuName("NVIDIA GeForce RTX 3060 Laptop GPU");
    expect(n.displayName.toLowerCase()).toContain("rtx 3060");
    expect(n.manufacturer).toBe("NVIDIA");
    expect(n.isVirtual).toBe(false);
  });

  it("flags virtual adapters", () => {
    const n = normalizeGpuName("Microsoft Basic Display Adapter");
    expect(n.isVirtual).toBe(true);
  });
});

describe("tierMeets", () => {
  it("compares tiers", () => {
    expect(tierMeets("high", "mid")).toBe(true);
    expect(tierMeets("low", "mid")).toBe(false);
    expect(tierMeets("unknown", "mid")).toBe(null);
  });
});

describe("mergeRequirementSpecs", () => {
  it("raises floors", () => {
    const m = mergeRequirementSpecs(
      { cpuTier: "low", ramMB: 8_000 },
      { cpuTier: "mid", ramMB: 16_000, gpuTier: "entry" }
    );
    expect(m?.cpuTier).toBe("mid");
    expect(m?.ramMB).toBe(16_000);
    expect(m?.gpuTier).toBe("entry");
  });
});

describe("effectiveHardwareRequirements", () => {
  it("merges game + edition + mods", () => {
    const eff = effectiveHardwareRequirements(
      { min: { cpuTier: "low", ramMB: 4000 }, recommended: { gpuTier: "low" } },
      { min: { gpuTier: "entry" } },
      [{ additional: { storageMB: 2000 } }]
    );
    expect(eff.min?.cpuTier).toBe("low");
    expect(eff.min?.gpuTier).toBe("entry");
    expect(eff.min?.storageMB).toBe(2000);
  });
});

describe("evaluateCompatibility", () => {
  it("returns unknown without structured requirements", () => {
    const r = evaluateCompatibility(
      { cpuTier: "high", gpuTier: "high", ramMB: 16000, osFamily: "windows" },
      {}
    );
    expect(r.verdict).toBe("unknown");
  });

  it("returns good when recommended met", () => {
    const r = evaluateCompatibility(
      {
        cpuTier: "mid",
        gpuTier: "mid",
        ramMB: 16000,
        osFamily: "windows",
        cpuDisplay: "Ryzen 5 5600",
        gpuDisplay: "RTX 3060",
      },
      {
        min: { cpuTier: "low", gpuTier: "entry", ramMB: 8000 },
        recommended: { cpuTier: "mid", gpuTier: "mid", ramMB: 16000 },
      }
    );
    expect(r.verdict).toBe("good");
  });

  it("returns unsupported on OS mismatch", () => {
    const r = evaluateCompatibility(
      { osFamily: "linux", cpuTier: "high", gpuTier: "high", ramMB: 32000 },
      { min: { os: ["windows"], cpuTier: "low" } }
    );
    expect(r.verdict).toBe("unsupported");
  });

  it("returns playable when only min met", () => {
    const r = evaluateCompatibility(
      {
        cpuTier: "low",
        gpuTier: "low",
        ramMB: 8000,
        osFamily: "windows",
        cpuDisplay: "i3",
        gpuDisplay: "GTX 1650",
      },
      {
        min: { cpuTier: "low", gpuTier: "low", ramMB: 8000 },
        recommended: { cpuTier: "mid", gpuTier: "mid", ramMB: 16000 },
      }
    );
    expect(r.verdict).toBe("playable");
  });
});

describe("parseFreeTextRequirements", () => {
  it("parses OpenRA-style min line", () => {
    const s = parseRequirementLine(
      "2 GHz dual-core CPU · 2 GB RAM · OpenGL 2.1 GPU · 1 GB storage"
    );
    expect(s?.ramMB).toBe(2048);
    expect(s?.storageMB).toBe(1024);
    expect(s?.apis).toContain("opengl");
    expect(s?.cpuText).toMatch(/2 GHz dual-core/i);
    expect(s?.gpuText).toMatch(/OpenGL 2\.1/i);
  });

  it("maps dedicated GPU to entry tier", () => {
    const s = parseRequirementLine(
      "3 GHz quad-core CPU · 4 GB RAM · Dedicated GPU · 2 GB storage"
    );
    expect(s?.gpuTier).toBe("entry");
    expect(s?.ramMB).toBe(4096);
  });

  it("parses GTX wording without inventing tier", () => {
    const s = parseRequirementLine(
      "3 GHz quad-core CPU · 8 GB RAM · GTX 1050 or better · 4 GB storage"
    );
    expect(s?.ramMB).toBe(8192);
    expect(s?.gpuText).toMatch(/GTX 1050/i);
    expect(s?.gpuTier).toBeUndefined();
  });

  it("returns null for vague recommended lines", () => {
    expect(parseRequirementLine("Any modern machine")).toBeNull();
  });

  it("builds a block with provenance", () => {
    const block = parseFreeTextRequirementsBlock({
      min: "1 GHz CPU · 512 MB RAM · Any GPU · 200 MB storage",
      recommended: "Any modern machine",
    });
    expect(block?.min?.ramMB).toBe(512);
    expect(block?.min?.storageMB).toBe(200);
    expect(block?.recommended).toBeUndefined();
    expect(block?.provenance).toEqual({
      source: "unverified",
      enteredBy: "free-text-parser",
    });
    expect(hasStructuredRequirements(block)).toBe(true);
  });

  it("OpenRA-style seed block is structured", () => {
    const block = parseFreeTextRequirementsBlock({
      min: "2 GHz dual-core CPU · 2 GB RAM · OpenGL 2.1 GPU · 1 GB storage",
      recommended: "3 GHz quad-core CPU · 4 GB RAM · Dedicated GPU · 2 GB storage",
    });
    expect(hasStructuredRequirements(block)).toBe(true);
  });
});
