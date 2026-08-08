/** Shared hardware / requirements types for PlayBound performance intelligence. */

export const PERFORMANCE_TIERS = ["entry", "low", "mid", "high", "enthusiast"] as const;
export type PerformanceTier = (typeof PERFORMANCE_TIERS)[number];
export type PerformanceTierOrUnknown = PerformanceTier | "unknown";

export const GRAPHICS_APIS = ["dx9", "dx10", "dx11", "dx12", "vulkan", "metal", "opengl"] as const;
export type GraphicsApi = (typeof GRAPHICS_APIS)[number];

export const REQUIREMENT_SOURCES = [
  "unverified",
  "community",
  "developer",
  "playbound_verified",
] as const;
export type RequirementSource = (typeof REQUIREMENT_SOURCES)[number];

export type OsFamily = "windows" | "macos" | "linux";
export type ArchKind = "x64" | "arm64" | "x86" | "unknown";

export type RequirementSpec = {
  os?: OsFamily[];
  arch?: ArchKind[];
  cpuTier?: PerformanceTier;
  cpuText?: string;
  gpuTier?: PerformanceTier;
  gpuText?: string;
  ramMB?: number;
  vramMB?: number;
  storageMB?: number;
  apis?: GraphicsApi[];
  notes?: string;
};

export type RequirementProvenance = {
  source: RequirementSource;
  sourceUrl?: string | null;
  verifiedAt?: string | null;
  enteredBy?: string | null;
};

export type HardwareRequirementsBlock = {
  min?: RequirementSpec;
  recommended?: RequirementSpec;
  target?: {
    resolution?: string;
    fps?: number;
    preset?: string;
  };
  provenance?: RequirementProvenance;
};

/** Mod additive requirements (merged into effective floors). */
export type ModHardwareRequirements = {
  additional?: RequirementSpec;
  provenance?: RequirementProvenance;
};

export type CompatibilityVerdict =
  | "excellent"
  | "good"
  | "playable"
  | "limited"
  | "unsupported"
  | "unknown";

export type CompatibilityReason = {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
};

export type CompatibilityResult = {
  verdict: CompatibilityVerdict;
  reasons: CompatibilityReason[];
  summary: string;
  compared: {
    user: {
      cpu?: string | null;
      cpuTier?: PerformanceTierOrUnknown | null;
      gpu?: string | null;
      gpuTier?: PerformanceTierOrUnknown | null;
      ramMB?: number | null;
      os?: string | null;
    };
    required: {
      min?: RequirementSpec | null;
      recommended?: RequirementSpec | null;
      target?: HardwareRequirementsBlock["target"] | null;
    };
  };
};

/** Extension point for future opt-in FPS samples (not collected yet). */
export type PerformanceSampleStub = {
  gameSlug: string;
  hardwareClass?: string;
  resolution?: string;
  graphicsSettings?: string;
  fpsAvg?: number;
  fpsRange?: [number, number];
};

export type DetectedGpu = {
  rawName: string;
  manufacturer?: string | null;
  model?: string | null;
  vramMB?: number | null;
  driverVersion?: string | null;
  vendorId?: string | null;
  deviceId?: string | null;
  isIntegrated?: boolean | null;
  isVirtual?: boolean | null;
};

export type HardwareProfilePayload = {
  schemaVersion: 1;
  collectedAt: string;
  os: {
    family: OsFamily | "unknown";
    name?: string | null;
    version?: string | null;
    arch: ArchKind;
    bitness?: 32 | 64 | null;
  };
  cpu: {
    rawName: string;
    manufacturer?: string | null;
    model?: string | null;
    arch?: string | null;
    cores?: number | null;
    threads?: number | null;
    baseFrequencyGHz?: number | null;
    features?: string[];
  };
  gpus: DetectedGpu[];
  primaryGpuIndex: number | null;
  primaryGpuConfidence: "low" | "medium" | "high";
  memory: {
    totalMB: number | null;
    availableMB?: number | null;
  };
  storage?: {
    totalAvailableMB?: number | null;
    installDrive?: {
      mount?: string | null;
      freeMB?: number | null;
      totalMB?: number | null;
      type?: "ssd" | "hdd" | "nvme" | "unknown" | null;
    } | null;
  };
  detectionErrors?: string[];
};
