type ErrorLike = {
  name?: unknown;
  code?: unknown;
  message?: unknown;
};

/**
 * `AbortSignal.timeout()` rejects with a DOMException whose shape varies a
 * little between Node releases. Recognize only timeout-shaped aborts so real
 * provider failures still reach the error logs.
 */
export function isUpstreamTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const candidate = error as ErrorLike;
  return (
    candidate.name === "TimeoutError" ||
    candidate.code === 23 ||
    /(?:timed? out|aborted due to timeout)/i.test(String(candidate.message ?? ""))
  );
}

