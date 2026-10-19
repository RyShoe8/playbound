import type { GameHostRoom } from "@/lib/gameHost/client";

/** A saved customer may control only their own live isolated RVGL room. */
export function customerRvglRoom(rooms: GameHostRoom[], serverId: string): string | null {
  if (!/^[a-f0-9]{24}$/.test(serverId)) return null;
  return rooms.find((room) => room.communityServerId === serverId &&
    room.gameSlug === "re-volt-rvgl" && room.identityProfile === "re-volt-rvgl-unix-v1" &&
    room.status === "running" && /^room_[a-f0-9]{16}$/.test(room.roomId))?.roomId || null;
}
