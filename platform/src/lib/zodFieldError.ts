import type { ZodError } from "zod";

/**
 * Turn a validation failure into a message that names the field.
 *
 * Returning `issues[0].message` alone produced errors like "Must be a full
 * http:// or https:// URL" with nothing saying *which* URL — and because the
 * schema validates every install-method block, not just the selected one, the
 * offending field is routinely one the editor is not even looking at. A stale
 * `official_download.url` left behind by switching an edition to the
 * playbound_installer will fail a save that appears, on screen, to be perfectly
 * valid.
 */
export function zodFieldError(err: ZodError): string {
  const issue = err.issues[0];
  if (!issue) return "Invalid payload";

  // Numeric segments are array indexes; render them as [n] rather than a dot.
  const path = issue.path
    .map((part, i) =>
      typeof part === "number" ? `[${part}]` : i === 0 ? String(part) : `.${String(part)}`
    )
    .join("");

  const extra =
    err.issues.length > 1 ? ` (and ${err.issues.length - 1} more)` : "";

  return path ? `${path}: ${issue.message}${extra}` : `${issue.message}${extra}`;
}
