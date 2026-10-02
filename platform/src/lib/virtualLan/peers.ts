import { isIP } from "node:net";

export function isPrivateOverlayAddress(value: unknown): value is string {
  if (typeof value !== "string" || isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export function partyLanAddresses(
  members: Array<{ userId: unknown; lanAddress?: string | null }>,
  viewerId: string,
  leaderId: string
): { peerAddresses: string[]; hostAddress: string | null } {
  const peerAddresses = members
    .filter((member) => String(member.userId) !== viewerId && isPrivateOverlayAddress(member.lanAddress))
    .map((member) => member.lanAddress as string);
  const leader = members.find((member) => String(member.userId) === leaderId);
  return {
    peerAddresses,
    hostAddress: leaderId !== viewerId && isPrivateOverlayAddress(leader?.lanAddress)
      ? leader.lanAddress : null,
  };
}
