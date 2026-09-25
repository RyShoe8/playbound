/** Exact agent GET routes that would otherwise look like mirror file paths. */
const AGENT_GET_ROUTES = new Set(["/metrics", "/rooms", "/managed"]);

/**
 * True for agent API paths, which must never fall through to the public
 * archive mirror. Exact routes alone missed the per-room GETs
 * (/rooms/:id/tes3mp/accounts, /managed/:id): they were served as mirror
 * files and 404'd, so the Morrowind panel always showed "No accounts yet".
 */
export function isAgentGetPath(pathname) {
  const normalized = String(pathname || "").replace(/\/+$/, "") || "/";
  return (
    AGENT_GET_ROUTES.has(normalized) ||
    normalized.startsWith("/rooms/") ||
    normalized.startsWith("/managed/")
  );
}
