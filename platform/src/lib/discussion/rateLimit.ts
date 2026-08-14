import RateLimitBucket from "@/lib/models/RateLimitBucket";

type Limit = { max: number; windowMs: number };

const NEW_TOPIC: Limit = { max: 1, windowMs: 30 * 60 * 1000 };
const NEW_REPLY: Limit = { max: 5, windowMs: 10 * 60 * 1000 };
const EST_TOPIC: Limit = { max: 3, windowMs: 60 * 60 * 1000 };
const EST_REPLY: Limit = { max: 20, windowMs: 10 * 60 * 1000 };
const REPORT: Limit = { max: 10, windowMs: 60 * 60 * 1000 };

export function isEstablishedAccount(createdAt: Date | string | undefined): boolean {
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs >= 7 * 24 * 60 * 60 * 1000;
}

export async function checkRateLimit(
  key: string,
  limit: Limit
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = new Date();

  // Start (or restart) an expired window. upsert+$setOnInsert means concurrent
  // openers collapse into one bucket instead of each resetting the count.
  const expiresAt = new Date(now.getTime() + limit.windowMs);
  const opened = await RateLimitBucket.findOneAndUpdate(
    { key, expiresAt: { $lte: now } },
    { $set: { count: 1, windowStart: now, expiresAt } },
    { returnDocument: "after" }
  );
  if (opened) return { ok: true };

  /**
   * Single atomic read-modify-write. Reading the count and then incrementing
   * as two statements lets a burst of concurrent requests all observe the same
   * pre-limit value and sail through together; the conditional $inc below
   * cannot, because the filter and the update are evaluated as one operation.
   */
  const bumped = await RateLimitBucket.findOneAndUpdate(
    { key, count: { $lt: limit.max } },
    { $inc: { count: 1 }, $setOnInsert: { windowStart: now, expiresAt } },
    { returnDocument: "after", upsert: true }
  ).catch(() => null);

  if (bumped) return { ok: true };

  // No document matched: either at the limit, or a duplicate-key race on the
  // upsert. Re-read to report an accurate retry window.
  const current = await RateLimitBucket.findOne({ key });
  if (!current) return { ok: true };
  if (current.expiresAt <= new Date()) return { ok: true };
  return {
    ok: false,
    retryAfterSec: Math.max(
      1,
      Math.ceil((current.expiresAt.getTime() - Date.now()) / 1000)
    ),
  };
}

export async function assertTopicRateLimit(
  userId: string,
  createdAt: Date | string | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  const established = isEstablishedAccount(createdAt);
  const limit = established ? EST_TOPIC : NEW_TOPIC;
  const result = await checkRateLimit(`topic:${userId}`, limit);
  if (!result.ok) {
    return {
      ok: false,
      error: `You're posting too quickly. Try again in ${Math.ceil(result.retryAfterSec / 60)} minute(s).`,
    };
  }
  return { ok: true };
}

export async function assertReplyRateLimit(
  userId: string,
  createdAt: Date | string | undefined
): Promise<{ ok: true } | { ok: false; error: string }> {
  const established = isEstablishedAccount(createdAt);
  const limit = established ? EST_REPLY : NEW_REPLY;
  const result = await checkRateLimit(`reply:${userId}`, limit);
  if (!result.ok) {
    return {
      ok: false,
      error: `You're replying too quickly. Try again in ${Math.ceil(result.retryAfterSec / 60)} minute(s).`,
    };
  }
  return { ok: true };
}

export async function assertReportRateLimit(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await checkRateLimit(`report:${userId}`, REPORT);
  if (!result.ok) {
    return { ok: false, error: "Too many reports. Try again later." };
  }
  return { ok: true };
}
