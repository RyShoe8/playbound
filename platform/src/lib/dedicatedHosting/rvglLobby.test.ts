import { describe, expect, it } from "vitest";
import { customerRvglRoom } from "./rvglLobby";
import type { GameHostRoom } from "@/lib/gameHost/client";

const id = "a".repeat(24);
const room = { roomId: "room_" + "b".repeat(16), communityServerId: id,
  gameSlug: "re-volt-rvgl", identityProfile: "re-volt-rvgl-unix-v1", status: "running" } as GameHostRoom;

describe("customer RVGL lobby room binding", () => {
  it("accepts only the exact running isolated room for the saved server", () => {
    expect(customerRvglRoom([room], id)).toBe(room.roomId);
    for (const bad of [
      { ...room, communityServerId: "c".repeat(24) },
      { ...room, gameSlug: "openra" },
      { ...room, identityProfile: null },
      { ...room, status: "pending" },
      { ...room, roomId: "../../other" },
    ]) expect(customerRvglRoom([bad as GameHostRoom], id)).toBeNull();
    expect(customerRvglRoom([room], "not-an-id")).toBeNull();
  });
});
