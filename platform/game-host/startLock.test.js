import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createStartCoordinator } from "./startLock.js";

describe("createStartCoordinator", () => {
  it("runs the same party starts one at a time", async () => {
    const coord = createStartCoordinator({
      maxRooms: () => 8,
      occupiedCount: () => 0,
    });
    const order = [];
    let releaseFirst;
    let firstStarted;
    const firstReady = new Promise((resolve) => {
      firstStarted = resolve;
    });
    const first = coord.withPartyLock("p1", () => {
      order.push("first-start");
      firstStarted();
      return new Promise((resolve) => {
        releaseFirst = () => {
          order.push("first-end");
          resolve("a");
        };
      });
    });
    const second = coord.withPartyLock("p1", async () => {
      order.push("second");
      return "b";
    });
    await firstReady;
    assert.deepEqual(order, ["first-start"]);
    releaseFirst();
    assert.equal(await first, "a");
    assert.equal(await second, "b");
    assert.deepEqual(order, ["first-start", "first-end", "second"]);
  });

  it("counts pending reservations against capacity", () => {
    let rooms = 7;
    const coord = createStartCoordinator({
      maxRooms: () => 8,
      occupiedCount: () => rooms,
    });
    assert.equal(coord.reserveCapacity(), true);
    assert.equal(coord.reserveCapacity(), false);
    coord.releaseCapacity();
    assert.equal(coord.reserveCapacity(), true);
    rooms = 8;
    coord.releaseCapacity();
    assert.equal(coord.reserveCapacity(), false);
  });
});
