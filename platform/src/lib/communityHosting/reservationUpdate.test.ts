import { describe, expect, it } from "vitest";
import { reservationUpsertUpdate } from "./reservationUpdate";

describe("event reservation upsert", () => {
  it.each([
    [null, "planned"],
    [{ profileKey: "old", state: "active" }, "planned"],
    [{ profileKey: "current", state: "released" }, "planned"],
    [{ profileKey: "current", state: "active" }, undefined],
  ] as const)("keeps state in one operator for %j", (existing, expectedState) => {
    const update = reservationUpsertUpdate(existing, "current", "event-id", "event:event-id", { profileKey: "current" });
    expect(update.$set.state).toBe(expectedState);
    expect(Object.keys(update.$set).filter((field) => field in update.$setOnInsert)).toEqual([]);
  });
});
