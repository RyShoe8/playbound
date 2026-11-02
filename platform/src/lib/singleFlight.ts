/** Coalesce concurrent work only; never retain a failed or stale result. */
export function createSingleFlight() {
  const pending = new Map<string, Promise<unknown>>();
  return function run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;
    const operation = Promise.resolve().then(task).finally(() => {
      pending.delete(key);
    });
    pending.set(key, operation);
    return operation;
  };
}
