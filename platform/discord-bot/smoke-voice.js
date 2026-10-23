/** Reversible Discord party-voice check; run inside the bot container. */
const base = `http://127.0.0.1:${process.env.PORT || 8787}`;
const secret = process.env.BOT_WEBHOOK_SECRET;

if (!secret) {
  console.error("BOT_WEBHOOK_SECRET is required");
  process.exit(1);
}

const headers = {
  authorization: `Bearer ${secret}`,
  "content-type": "application/json",
};
let voiceChannelId = null;
let failed = false;

try {
  const response = await fetch(`${base}/parties/voice`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      partyId: `smoke-${Date.now()}`,
      gameSlug: "playbound",
      name: "PlayBound Voice Smoke Test",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json();
  voiceChannelId = result.voiceChannelId || null;
  if (!response.ok || !result.success || !voiceChannelId || !result.inviteUrl) {
    throw new Error(`Party voice provision failed (HTTP ${response.status})`);
  }
  console.log("Party voice room created successfully");
} catch (error) {
  failed = true;
  console.error(error?.message || error);
} finally {
  if (voiceChannelId) {
    try {
      const response = await fetch(`${base}/parties/voice/cleanup`, {
        method: "POST",
        headers,
        body: JSON.stringify({ voiceChannelId }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      console.log("Temporary party voice room cleaned up");
    } catch (error) {
      failed = true;
      console.error(`Party voice cleanup failed: ${error?.message || error}`);
    }
  }
}

if (failed) process.exitCode = 1;
