/** A self-hosted party may have a VPS-capable game but no VPS room. */
export function partyConnectReady(party, isLeader) {
  const hosted = party.hosted || {};
  const lan = party.lan || {};
  if (party.hostMode !== "self" && hosted.enabled && hosted.status !== "ready") return false;
  if (lan.enabled && lan.configured !== false && lan.status !== "ready") return false;
  if (!isLeader && lan.requiresHostReady && !party.selfHostReady) return false;
  if (!isLeader && party.hostMode === "self" && !lan.enabled && !party.selfHostReady) return false;
  return true;
}

export function partyConnectFailed(party) {
  const hosted = party.hosted || {};
  const lan = party.lan || {};
  return (party.hostMode !== "self" && hosted.enabled && hosted.status === "failed") ||
    (lan.enabled && lan.status === "failed");
}
