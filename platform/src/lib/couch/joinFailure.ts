/** Safe diagnostics for a failed controller/stream join. Never include the join URL or tokens. */
export type CouchJoinFailure = {
  code: string;
  message: string;
  httpStatus?: number;
};

const KNOWN_REASONS = new Set([
  "Session not found.",
  "Session ended.",
  "Session is full.",
  "No free player slots.",
  "Player slot changed. Try again.",
  "Could not reserve a player slot.",
  "Internal Server Error",
]);

export function couchJoinHttpFailure(status: number, serverError: unknown): CouchJoinFailure {
  const reason = typeof serverError === "string" && KNOWN_REASONS.has(serverError)
    ? `: ${serverError}` : "";
  return {
    code: `JOIN_HTTP_${status}`,
    message: `Couch join returned HTTP ${status}${reason}`,
    httpStatus: status,
  };
}

export function couchJoinRequestFailure(error: unknown): CouchJoinFailure {
  return {
    code: "JOIN_REQUEST_FAILED",
    message: `Couch join request failed (${error instanceof Error ? error.name : "unknown error"})`,
  };
}
