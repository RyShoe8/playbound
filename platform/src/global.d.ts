import type { Mongoose } from "mongoose";

declare global {
  /**
   * Cached Mongoose connection, reused across hot reloads and serverless
   * invocations. Deliberately not named `mongoose`: a global of that name
   * shadows the imported module inside lib/db.ts, which made `typeof mongoose`
   * resolve to this cache shape instead of the driver.
   */
  var __mongooseCache:
    | {
        conn: Mongoose | null;
        promise: Promise<Mongoose> | null;
      }
    | undefined;
}

export {};
