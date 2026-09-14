/** True when the platform ICE list includes a TURN relay (needed for many HTTPS → LAN paths). */
export function iceServersIncludeTurn(servers: RTCIceServer[]): boolean {
  for (const s of servers) {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    for (const u of urls) {
      if (typeof u === "string" && u.toLowerCase().startsWith("turn:")) return true;
    }
  }
  return false;
}

export function isPublicHttpsOrigin(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "https:") return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1";
}

export async function addRemoteIceCandidate(
  pc: RTCPeerConnection,
  candidate: RTCIceCandidateInit | null | undefined,
  complete?: boolean
): Promise<void> {
  if (complete || candidate === null) {
    try {
      await pc.addIceCandidate(undefined as unknown as RTCIceCandidateInit);
    } catch {
      try {
        await pc.addIceCandidate({ candidate: "", sdpMid: "0", sdpMLineIndex: 0 });
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (!candidate) return;
  try {
    await pc.addIceCandidate(candidate);
  } catch {
    /* ignore trickle races */
  }
}
