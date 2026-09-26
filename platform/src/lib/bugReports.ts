export const BUG_REPORT_SOURCES = ["website", "launcher"] as const;
export type BugReportSource = (typeof BUG_REPORT_SOURCES)[number];

export const BUG_REPORT_KINDS = ["bug", "suggestion"] as const;
export type BugReportKind = (typeof BUG_REPORT_KINDS)[number];

export const BUG_REPORT_KIND_LABELS: Record<BugReportKind, string> = {
  bug: "Bug",
  suggestion: "Suggestion",
};

export function isBugReportKind(value: unknown): value is BugReportKind {
  return typeof value === "string" && (BUG_REPORT_KINDS as readonly string[]).includes(value);
}

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
