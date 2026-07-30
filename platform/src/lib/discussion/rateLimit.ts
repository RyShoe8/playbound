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
  const doc = await RateLimitBucket.findOne({ key });
  if (!doc || doc.expiresAt <= now) {
    const expiresAt = new Date(now.getTime() + limit.windowMs);
    await RateLimitBucket.findOneAndUpdate(
      { key },
      { key, count: 1, windowStart: now, expiresAt },
      { upsert: true }
    );
    return { ok: true };
  }
  if (doc.count >= limit.max) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((doc.expiresAt.getTime() - now.getTime()) / 1000)
    );
    return { ok: false, retryAfterSec };
  }
  await RateLimitBucket.updateOne({ key }, { $inc: { count: 1 } });
  return { ok: true };
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
