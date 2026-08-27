"use strict";

const GAMEJOLT_BUILD_ENDPOINT =
  "https://gamejolt.com/site-api/web/discover/games/builds/get-download-url";

async function resolveGameJoltBuild(buildId, { fetchImpl = globalThis.fetch } = {}) {
  const id = String(buildId || "").trim();
  if (!/^\d+$/.test(id)) throw new Error("GameJolt build ID is missing or invalid.");
  if (typeof fetchImpl !== "function") throw new Error("Download resolver is unavailable.");

  const response = await fetchImpl(`${GAMEJOLT_BUILD_ENDPOINT}/${id}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "playbound-launcher",
    },
    body: JSON.stringify({ forceDownload: true }),
  });
  if (!response.ok) throw new Error(`GameJolt build resolver returned ${response.status}.`);

  const data = await response.json();
  const url = data?.payload?.url;
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("GameJolt did not return a download URL for this build.");
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !/(^|\.)gamejolt\.net$/i.test(parsed.hostname)) {
    throw new Error("GameJolt returned an untrusted download URL.");
  }
  return parsed.toString();
}

module.exports = { GAMEJOLT_BUILD_ENDPOINT, resolveGameJoltBuild };
