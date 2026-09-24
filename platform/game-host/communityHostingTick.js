/** 15-minute VPS timer: run the short site control-plane pass. */
const secret = process.env.GAME_HOST_SECRET;
const site = (process.env.PLAYBOUND_SITE_URL || "https://playbound.club").replace(/\/+$/, "");
if (!secret) {
  console.error("GAME_HOST_SECRET is required for the hosting timer");
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`${site}/api/cron/community-hosting`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${result.error || "unknown error"}`);
    console.log(`[community-hosting] ${result.action || "ok"}${result.reason ? `: ${result.reason}` : ""}`);
  } catch (error) {
    console.error("[community-hosting] tick failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
