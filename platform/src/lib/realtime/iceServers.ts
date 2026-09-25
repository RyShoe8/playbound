/**
 * Shared STUN/TURN for WebRTC — Couch guests and PlayBound-native multiplayer.
 *
 * Platform owns the ICE list. Hosts must not publish a narrow STUN-only set that
 * overwrites these on join (remote HTTPS guests cannot fall back to LAN ws://).
 */

import crypto from "crypto";

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/** Coturn entries always use a single URL string (multiplayer API shape). */
export type TurnServerConfig = {
  urls: string;
  username: string;
  credential: string;
};

/** Public STUN plus optional VPS STUN when GAME_HOST_PUBLIC_IP is set. */
function defaultStunUrls(): string[] {
  const vpsIp = process.env.GAME_HOST_PUBLIC_IP;
  const stunPort = process.env.STUN_PORT || "3478";
  return [
    ...(vpsIp ? [`stun:${vpsIp}:${stunPort}`] : []),
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
    "stun:stun2.l.google.com:19302",
    "stun:stun.cloudflare.com:3478",
    "stun:global.stun.twilio.com:3478",
  ];
}

/** Coturn time-limited credentials when VPS IP + TURN_SHARED_SECRET are set. */
export function turnIceServers(sessionId: string): TurnServerConfig[] {
  const vpsIp = process.env.GAME_HOST_PUBLIC_IP;
  const stunPort = process.env.STUN_PORT || "3478";
  const turnSecret = process.env.TURN_SHARED_SECRET;
  if (!vpsIp || !turnSecret) return [];

  const expires = Math.floor(Date.now() / 1000) + 60 * 60;
  const username = `${expires}:${sessionId}`;
  const credential = crypto
    .createHmac("sha1", turnSecret)
    .update(username)
    .digest("base64");
  return [{ urls: `turn:${vpsIp}:${stunPort}`, username, credential }];
}

/** RTCPeerConnection iceServers for a given session (STUN ± TURN). */
export function sessionIceServers(sessionId: string): IceServerConfig[] {
  return [
    ...defaultStunUrls().map((urls) => ({ urls })),
    ...turnIceServers(sessionId),
  ];
}

/** STUN-only RTCIceServer list (no session / no TURN). */
export function defaultIceServers(): IceServerConfig[] {
  return defaultStunUrls().map((urls) => ({ urls }));
}

/** Shape used by PlayBound-native multiplayer create/join responses. */
export function multiplayerRelayServers(sessionId: string): {
  stunServers: string[];
  turnServers?: TurnServerConfig[];
} {
  const stunServers = defaultStunUrls();
  const turnServers = turnIceServers(sessionId);
  if (!turnServers.length) return { stunServers };
  return { stunServers, turnServers };
}
