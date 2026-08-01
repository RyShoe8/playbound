export const BUG_REPORT_SOURCES = ["website", "launcher"] as const;
export type BugReportSource = (typeof BUG_REPORT_SOURCES)[number];

export const BUG_REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;
export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

export const BUG_REPORT_STATUS_LABELS: Record<BugReportStatus, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export function isBugReportStatus(value: unknown): value is BugReportStatus {
  return typeof value === "string" && (BUG_REPORT_STATUSES as readonly string[]).includes(value);
}

export function isTerminalBugStatus(status: BugReportStatus): boolean {
  return status === "resolved" || status === "dismissed";
}
