/**
 * Ask the game-host VPS to auto-install any missing downloadable dedicated
 * binaries (e.g. etlded for Enemy Territory). Soft-fails when GAME_HOST_* is
 * unset or the agent is unreachable — never blocks a Vercel build.
 *
 * Requires the VPS agent to already include ensureGame.js (one install.sh /
 * agent copy + restart). After that, production builds keep binaries in sync.
 *
 * Usage: npm run sync:game-host
 */

const TIMEOUT_MS = 10 * 60 * 1000;

async function syncGameHost() {
  const base = process.env.GAME_HOST_URL?.replace(/\/$/, "");
  const secret = process.env.GAME_HOST_SECRET;
  if (!base || !secret) {
    console.log("[sync:game-host] skip — GAME_HOST_URL / GAME_HOST_SECRET unset");
    return;
  }

  console.log(`[sync:game-host] POST ${base}/ensure-missing …`);
  let res: Response;
  try {
    res = await fetch(`${base}/ensure-missing`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[sync:game-host] unreachable: ${message}`);
    return;
  }

  if (res.status === 404) {
    console.warn(
      "[sync:game-host] agent has no /ensure-missing — run updated install.sh on the VPS once, then restart playbound-game-host"
    );
    return;
  }

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    games?: Record<string, boolean>;
    results?: Record<string, { ok?: boolean; skipped?: boolean; error?: string }>;
    error?: string;
  };

  if (!res.ok) {
    console.warn(
      `[sync:game-host] HTTP ${res.status}: ${data.error || JSON.stringify(data).slice(0, 200)}`
    );
    return;
  }

  const et = data.games?.["wolfenstein-enemy-territory"];
  console.log(
    `[sync:game-host] ok=${Boolean(data.ok)} wolfenstein-enemy-territory=${et === true}`
  );
  if (data.results) {
    for (const [slug, result] of Object.entries(data.results)) {
      const flag = result.skipped ? "skipped" : result.ok ? "installed" : "failed";
      console.log(
        `  ${slug}: ${flag}${result.error ? ` — ${result.error}` : ""}`
      );
    }
  }
}

void syncGameHost().catch((err) => {
  console.warn("[sync:game-host] unexpected error:", err);
});

export {};
