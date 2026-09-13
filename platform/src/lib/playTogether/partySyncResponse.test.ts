import { describe, expect, it } from "vitest";
import { partySyncResponseBody } from "./partySyncResponse";

describe("partySyncResponseBody", () => {
  it("omits a failed section instead of returning an empty array", () => {
    const body = partySyncResponseBody({
      friends: [{ id: "a" }],
      incoming: [],
      outgoing: [],
      myParties: [],
      discoverable: [],
      errors: ["friends"],
    });
    expect(body.friends).toBeUndefined();
    expect(body.myParties).toEqual([]);
    expect(body.errors).toEqual(["friends"]);
  });

  it("includes every successful section", () => {
    const body = partySyncResponseBody({
      friends: [{ id: "a" }],
      incoming: [{ id: "in" }],
      outgoing: [],
      myParties: [{ id: "p" }],
      discoverable: [{ id: "d" }],
      errors: [],
    });
    expect(body.friends).toEqual([{ id: "a" }]);
    expect(body.incoming).toEqual([{ id: "in" }]);
    expect(body.myParties).toEqual([{ id: "p" }]);
    expect(body.discoverable).toEqual([{ id: "d" }]);
    expect(body.errors).toBeUndefined();
  });
});
