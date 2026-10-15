import { createHash } from "node:crypto";

export const UPDATE_FAILURE_EVENT = "community_server_update_failed";
/** Deterministic Mongo _id: existing unique primary key makes retries atomic. */
export function updateFailureReceipt(jobId: unknown): string | null {
  if (typeof jobId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(jobId)) return null;
  return createHash("sha256").update(`installation-update-failure:${jobId}`).digest("hex").slice(0, 24);
}
