const { test } = require("node:test");
const assert = require("node:assert/strict");
const { localCoopPlayerCapacity } = require("./localCoop");

test("enables multiple phone-hub pads only for simultaneous local play", () => {
  assert.equal(localCoopPlayerCapacity({ features: ["Couch Co-Op"], maxPlayers: 2 }), 2);
  assert.equal(localCoopPlayerCapacity({ tags: ["Split-Screen"] }), 4);
  assert.equal(localCoopPlayerCapacity({ features: ["Multiplayer", "LAN Support"], maxPlayers: 16 }), null);
  assert.equal(localCoopPlayerCapacity({ features: ["Hotseat"], maxPlayers: 4 }), null);
  assert.equal(localCoopPlayerCapacity({ features: ["Hotseat"], tags: ["Couch Co-op"], maxPlayers: 8 }), null);
});
