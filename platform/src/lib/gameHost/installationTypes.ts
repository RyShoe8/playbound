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
  targets: { key: string; name: string; installed: boolean; buildId?: string; rollbackAvailable: boolean }[];
  jobs: InstallationUpdateJob[];
};
