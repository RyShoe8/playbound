export const PHONE_HUB_REUSE_MS = 2 * 60 * 60 * 1000;

/** The reuse window limits game switches, not the life of a running game. */
export function phoneHubDecision(session, lease, gameSlug, now = Date.now()) {
  if (!session?.solo || !session.sessionId) return "other-session";
  const approved = (session.snapshot?.controllers || [])
    .filter((controller) => controller.status === "approved");
  if (approved.length === 0) return "pair";

  const sameLease = lease?.sessionId === session.sessionId;
  const firstPairedAt = Math.min(...approved
    .map((controller) => Number(controller.createdAt))
    .filter((value) => Number.isFinite(value) && value > 0));
  const pairedAt = Number.isFinite(firstPairedAt)
    ? firstPairedAt
    : sameLease ? Number(lease.pairedAt) : NaN;
  if (
    sameLease &&
    lease.gameSlug &&
    lease.gameSlug !== gameSlug &&
    Number.isFinite(pairedAt) &&
    now - pairedAt >= PHONE_HUB_REUSE_MS
  ) {
    return "rotate";
  }
  return "reuse";
}

export function phoneHubPairedAt(session, fallback = Date.now()) {
  const times = (session?.snapshot?.controllers || [])
    .filter((controller) => controller.status === "approved")
    .map((controller) => Number(controller.createdAt))
    .filter((value) => Number.isFinite(value) && value > 0);
  return times.length ? Math.min(...times) : fallback;
}
