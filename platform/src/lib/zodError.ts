import type { ZodError } from "zod";

/** First Zod issue as `path: message` (or just message when path is empty). */
export function firstZodErrorMessage(err: ZodError, fallback = "Invalid payload"): string {
  const issue = err.issues[0];
  if (!issue) return fallback;
  const path = issue.path.length ? issue.path.join(".") : "";
  return path ? `${path}: ${issue.message}` : issue.message;
}
