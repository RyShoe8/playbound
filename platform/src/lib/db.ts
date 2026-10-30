import mongoose from "mongoose";
import { attachDbDiagnostics } from "@/lib/dbDiagnostics";


/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
const cached =
  global.__mongooseCache ?? (global.__mongooseCache = { conn: null, promise: null });

async function connectOnce() {
  if (mongoose.connection.readyState === 1) {
    cached.conn = mongoose;
    return cached.conn;
  }

  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI || MONGODB_URI === "[SENSITIVE]" || (!MONGODB_URI.startsWith("mongodb://") && !MONGODB_URI.startsWith("mongodb+srv://"))) {
    throw new Error(
      "Please define a valid MONGODB_URI (starting with mongodb:// or mongodb+srv://) inside .env"
    );
  }

  if (cached.conn) {
    cached.conn = null;
    cached.promise = null;
  }

  if (!cached.promise) {
    // Keep per-instance pools small: serverless instances each own a pool.
    // A TLS alert can also reflect a transient server/network failure; it does
    // not, by itself, establish that the database exhausted its connections.
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 0,
      // Return a connection to the pool quickly; idle lambdas should not sit on
      // sockets the rest of the fleet could be using.
      maxIdleTimeMS: 60_000,
      // Fail fast rather than piling up waiters behind an unhealthy cluster.
      serverSelectionTimeoutMS: 5_000,
      waitQueueTimeoutMS: 10_000,
      // Emits per-command timings for the slow-query log in dbDiagnostics.
      monitorCommands: true,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts);
  }

  try {
    cached.conn = await cached.promise;
    try {
      const client = cached.conn.connection.getClient();
      attachDbDiagnostics(client, client.options?.maxPoolSize ?? 0);
    } catch {
      /* diagnostics must never break a connection */
    }
  } catch (e) {
    cached.promise = null;
    cached.conn = null;
    throw e;
  }

  return cached.conn;
}

// Build-only connection retries are bounded and back off between attempts.
const CONNECT_RETRIES = 3;
const CONNECT_BACKOFF_MS = [250, 1000, 2500];

export function isRetryableConnectionError(err: unknown): boolean {
  const labels = (err as { errorLabelSet?: Set<string> })?.errorLabelSet;
  if (labels instanceof Set) {
    if (labels.has("RetryableError") || labels.has("SystemOverloadedError")) return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  // Retry transient transport failures without assuming their root cause.
  return /tlsv1 alert internal error|ECONNRESET|ETIMEDOUT/i.test(message);
}

/** Availability errors can occur during checkout/queries, after connect succeeds. */
export function isDatabaseAvailabilityError(error: unknown): boolean {
  const labels = (error as { errorLabelSet?: Set<string> })?.errorLabelSet;
  if (labels instanceof Set && (labels.has("RetryableError") || labels.has("SystemOverloadedError"))) return true;
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return /^(Mongo|Mongoose)(ServerSelectionError|NetworkError|NetworkTimeoutError|WaitQueueTimeoutError|PoolClearedError|OperationTimeoutError)$/.test(name)
    || /tlsv1 alert internal error|server selection timed out|timed out while checking out a connection from connection pool/i.test(message);
}

/** Retry only this read-only probe, never a reconciliation with side effects. */
export async function ensureHostingDatabaseReady(): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const connection = await dbConnect();
      if (!connection.connection.db) throw new Error("Database connection unavailable");
      await connection.connection.db.command({ ping: 1 }, { timeoutMS: 2_000 });
      return;
    } catch (error) {
      if (attempt === 1 || !isDatabaseAvailabilityError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
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
