import { describe, expect, it } from "vitest";
import { hostedPayloadFromDoc } from "./provision";
import { lanPayloadFromDoc } from "@/lib/virtualLan/provision";
import { HOSTABLE_SLUGS } from "./catalog";
import { isSelfHostable } from "@/lib/multiplayer/adapters";

describe("party hosting mode payloads", () => {
  it("offers self-hosting for every PlayBound-hostable multiplayer game", () => {
    expect(HOSTABLE_SLUGS.filter((slug) => !isSelfHostable(slug))).toEqual([]);
  });
  it("exposes only the VPS route in managed mode", () => {
    const hosted = hostedPayloadFromDoc(
      "goldeneye-source",
      { status: "ready", host: "203.0.113.10", port: 27045 },
      "managed"
    );
    const lan = lanPayloadFromDoc("goldeneye-source", { status: "none" }, "managed");

    expect(hosted.enabled).toBe(true);
    expect(hosted.status).toBe("ready");
    expect(lan.enabled).toBe(false);
  });

  it("exposes only the overlay route in self-host mode", () => {
    const hosted = hostedPayloadFromDoc(
      "goldeneye-source",
      { status: "ready", host: "203.0.113.10", port: 27045 },
      "self"
    );
    const lan = lanPayloadFromDoc("goldeneye-source", { status: "ready" }, "self");

    expect(hosted.enabled).toBe(false);
    expect(lan.enabled).toBe(true);
    expect(lan.status).toBe("ready");
  });

  it("exposes an overlay for multiplayer games without an automatic host recipe", () => {
    const lan = lanPayloadFromDoc(
      "community-multiplayer-game",
      { status: "ready" },
      "self"
    );

    expect(lan.enabled).toBe(true);
    expect(lan.status).toBe("ready");
    expect(lan.adapterFile).toBeNull();
  });
});
