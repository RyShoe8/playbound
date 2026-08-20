import mongoose from "mongoose";

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
const cached =
  global.__mongooseCache ?? (global.__mongooseCache = { conn: null, promise: null });

async function dbConnect() {
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

export default dbConnect;
