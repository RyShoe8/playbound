/**
 * A serverless instance shares one small Mongo connection pool across requests.
 * Cold per-entity activity snapshots each issue several queries, so refreshing
 * many game/edition/mod caches at once can exhaust that pool. Keep the work
 * bounded without changing the snapshots or caching a misleading zero.
 */
export function createLiveActivityLimiter(maxActive: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  return async function withPermit<T>(task: () => Promise<T>): Promise<T> {
    if (active < maxActive) {
      active += 1;
    } else {
      // The releaser transfers its permit directly to this waiter.
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

export const withLiveActivityPermit = createLiveActivityLimiter(2);
