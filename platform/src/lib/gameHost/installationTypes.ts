export type InstallationUpdateAction = "update" | "rollback" | "cancel";
export type InstallationUpdateJob = {
  id: string;
  key: string;
  action: "update" | "rollback";
  actor: string;
  status: string;
  message?: string;
  createdAt: number;
  updatedAt?: number;
  beforeBuild?: string;
  afterBuild?: string;
};
export type InstallationUpdateSnapshot = {
  daily?: {
    enabled: boolean;
    startedAt?: number;
    completedAt?: number;
    nextCheckAt: number;
    message?: string;
    targets: Record<string, { checkedAt: number; installedBuild?: string; availableBuild?: string; status: string; message?: string }>;
  };
  /** Agent recipe inventory, including dedicated-only games and aliases. */
  gameSlugs?: string[];
  targets: { key: string; name: string; installed: boolean; buildId?: string; rollbackAvailable: boolean; blockedReason?: string }[];
  jobs: InstallationUpdateJob[];
};

export type InstallationCoverageRow = {
  id: string;
  name: string;
  category: "supported" | "os-package" | "archive" | "custom-build" | "private-runtime" | "edition" | "review";
  installationKey?: string;
  reason: string;
};
