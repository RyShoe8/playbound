import type { Game } from "@/lib/data/types";
import type { HardwareRequirementsBlock } from "@/lib/hardware/types";

/** Mongo-only overlay for Dungeon Keeper Gold PC requirements. No other fields. */
export const DUNGEON_KEEPER_GOLD_SLUG = "dungeon-keeper-gold";

const GOG_PRODUCT_URL = "https://www.gog.com/en/game/dungeon_keeper";

export const dungeonKeeperGoldSystemRequirements: Game["systemRequirements"] = {
  min: "Windows 7 · 1 GHz CPU · 256 MB RAM · DirectX 7-class GPU · 500 MB storage",
  recommended: "Windows 10 · dual-core · 512 MB RAM · 800 MB storage",
};

export const dungeonKeeperGoldHardwareRequirements: HardwareRequirementsBlock = {
  min: {
    os: ["windows"],
    ramMB: 256,
    storageMB: 500,
    cpuText: "1 GHz",
    gpuText: "DirectX 7-class GPU",
  },
  recommended: {
    os: ["windows"],
    ramMB: 512,
    storageMB: 800,
    cpuText: "dual-core",
  },
  provenance: {
    source: "developer",
    sourceUrl: GOG_PRODUCT_URL,
  },
};
