export const REPORT_TARGET_TYPES = ["topic", "reply", "review", "user"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "illegal_content",
  "misinformation",
  "off_topic",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "reviewing", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
