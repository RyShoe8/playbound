import mongoose from "mongoose";

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
const cached =
  global.__mongooseCache ?? (global.__mongooseCache = { conn: null, promise: null });

async function connectOnce() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env"
    );
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    /*
     * Sized for serverless, where the default is actively harmful.
     *
     * Mongoose defaults maxPoolSize to 100. That is a sensible number for one
     * long-lived server and a disaster across lambdas: every instance opens its
     * own pool, so a handful of concurrent instances — or a build generating
     * pages across three workers — asks Atlas for several hundred connections
     * at once. The cluster answers by completing the TLS handshake and then
     * sending an internal-error alert, which surfaces as MongoNetworkError
     * labelled SystemOverloadedError. It reads like an outage and is really
     * connection exhaustion we caused.
     *
     * A small pool per instance is the standard fix: each one needs very few
     * concurrent queries, and instances scale horizontally rather than each
     * needing depth.
     */
    const opts = {
      bufferCommands: false,
      maxPoolSize: 5,
      minPoolSize: 0,
      // Return a connection to the pool quickly; idle lambdas should not sit on
      // sockets the rest of the fleet could be using.
      maxIdleTimeMS: 15_000,
      // Fail fast rather than piling up waiters behind an unhealthy cluster.
      serverSelectionTimeoutMS: 10_000,
      waitQueueTimeoutMS: 10_000,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/**
 * How many times a refused connection is worth retrying, and how long to wait.
 *
 * Atlas answers a saturated cluster by completing the TLS handshake and then
 * sending an internal-error alert. The driver labels that `RetryableError` and
 * `SystemOverloadedError` — it is explicitly telling us to come back — but
 * every caller gave up on the first refusal, so a moment of pressure during a
 * build became a failed deploy.
 *
 * Backoff matters more than attempt count here: retrying immediately just adds
 * to the load that caused the refusal.
 */
const CONNECT_RETRIES = 3;
const CONNECT_BACKOFF_MS = [250, 1000, 2500];

export function isRetryableConnectionError(err: unknown): boolean {
  const labels = (err as { errorLabelSet?: Set<string> })?.errorLabelSet;
  if (labels instanceof Set) {
    if (labels.has("RetryableError") || labels.has("SystemOverloadedError")) return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  // The TLS alert the cluster sends when it is out of connections.
  return /tlsv1 alert internal error|ECONNRESET|ETIMEDOUT/i.test(message);
}

/**
 * Connect, riding out a briefly overloaded cluster during a build.
 *
 * Retries only while prerendering. A build has time to wait and everything to
 * lose from not waiting — one refused connection fails the entire deploy. A
 * live request has the opposite shape: four attempts behind a ten-second
 * selection timeout is forty seconds a visitor spends staring at nothing, so
 * at runtime it still fails on the first refusal and lets the caller fall back
 * to cached content.
 */
async function dbConnect() {
  const retrying = process.env.NEXT_PHASE === "phase-production-build";
  if (!retrying) return connectOnce();

  let lastError: unknown;
  for (let attempt = 0; attempt <= CONNECT_RETRIES; attempt += 1) {
    try {
      return await connectOnce();
    } catch (err) {
      lastError = err;
      if (attempt === CONNECT_RETRIES || !isRetryableConnectionError(err)) break;
      const wait = CONNECT_BACKOFF_MS[Math.min(attempt, CONNECT_BACKOFF_MS.length - 1)];
      console.warn(
        `[db] connection refused (attempt ${attempt + 1}/${CONNECT_RETRIES + 1}), retrying in ${wait}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}

export default dbConnect;
