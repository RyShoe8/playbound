import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptedSettingsFor, recipes } from "./recipes.js";

test("managed CS2 uses the configured startup slot limit", () => {
  const settings = acceptedSettingsFor("counter-strike-2", { maxPlayers: 12, unrelated: 99 });
  assert.deepEqual(settings, { maxPlayers: 12 });
  const args = recipes["counter-strike-2"].args(27030, { managed: true, settings, name: "Community" });
  const index = args.indexOf("-maxplayers");
  assert.equal(args[index + 1], "12");
  const partyArgs = recipes["counter-strike-2"].args(27030, { managed: false, settings, name: "Party" });
  assert.equal(partyArgs[partyArgs.indexOf("-maxplayers") + 1], "16");
});
