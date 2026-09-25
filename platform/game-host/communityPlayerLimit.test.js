import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptedSettingsFor, BOT_FILL_RECIPES, botFillCount, recipes } from "./recipes.js";
import { readFileSync } from "node:fs";

const managed = (slug, limit = 12) => ({
  managed: true, partyId: "community-12345678", name: "Community",
  settings: acceptedSettingsFor(slug, { maxPlayers: limit }),
});

test("managed CS2 uses the configured startup slot limit", () => {
  const settings = acceptedSettingsFor("counter-strike-2", { maxPlayers: 12, unrelated: 99 });
  assert.deepEqual(settings, { maxPlayers: 12 });
  const args = recipes["counter-strike-2"].args(27030, { managed: true, settings, name: "Community" });
  const index = args.indexOf("-maxplayers");
  assert.equal(args[index + 1], "12");
  const partyArgs = recipes["counter-strike-2"].args(27030, { managed: false, settings, name: "Party" });
  assert.equal(partyArgs[partyArgs.indexOf("-maxplayers") + 1], "16");
});

test("the scheduler and agent agree on every managed player-limit recipe", () => {
  const source = readFileSync(new URL("../src/lib/communityHosting/reconcile.ts", import.meta.url), "utf8");
  const declared = source.match(/const PLAYER_LIMIT_RECIPES = new Set\(\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(declared, "scheduler list must be inspectable");
  const slugs = [...declared.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
  for (const slug of slugs) {
    assert.ok(recipes[slug], `${slug} has a recipe`);
    assert.deepEqual(acceptedSettingsFor(slug, { maxPlayers: 12 }), { maxPlayers: 12 }, `${slug} accepts the limit`);
  }
});

test("managed server recipes translate the cap into native command-line controls", () => {
  const cases = [
    ["assaultcube", "-c12"],
    ["medal-of-honor-allied-assault", "sv_maxclients", "12"],
    ["bzflag", "-mp", "12"],
    ["supertuxkart", "--max-players=8"],
    ["xonotic", "+maxplayers", "12"],
    ["openarena", "sv_maxclients", "12"],
    ["0-ad", "-autostart-host-players=8"],
    ["bombsquad", "8"],
    ["wolfenstein-enemy-territory", "sv_maxclients", "12"],
    ["team-fortress-2", "+maxplayers", "12"],
    ["unvanquished", "sv_maxclients", "12"],
    ["hurry-curry", "--max-players", "12"],
    ["freedoom", "+sv_maxplayers", "12"],
  ];
  for (const [slug, flag, value] of cases) {
    const args = recipes[slug].args(27030, managed(slug));
    const index = args.indexOf(flag);
    assert.notEqual(index, -1, `${slug} includes ${flag}`);
    if (value !== undefined) assert.equal(args[index + 1], value, `${slug} uses the admin cap`);
  }
  assert.match(recipes.mindustry.stdin(6567, managed("mindustry")), /playerlimit 12\nhost/);
  assert.doesNotMatch(recipes.mindustry.stdin(6567, { managed: false, name: "Party" }), /playerlimit/);
  const openTtdArgs = recipes.openttd.args(3979, managed("openttd"));
  assert.ok(openTtdArgs.includes("-c"));
  assert.ok(!recipes.openttd.args(3979, { managed: false }).includes("-c"));
  // These games store maxPlayers on the room for agent fallback display, or
  // patch it into a config file — they have no command-line translation.
  for (const slug of ["hedgewars", "veloren"]) {
    assert.deepEqual(acceptedSettingsFor(slug, { maxPlayers: 12 }), { maxPlayers: 12 }, `${slug} accepts maxPlayers`);
  }
});

test("the scheduler and agent agree on the bot-fill recipes, and each honours it", () => {
  const source = readFileSync(new URL("../src/lib/communityHosting/reconcile.ts", import.meta.url), "utf8");
  const declared = source.match(/const BOT_FILL_RECIPES = new Set\(\[([\s\S]*?)\]\)/)?.[1];
  assert.ok(declared, "scheduler bot list must be inspectable");
  const slugs = [...declared.matchAll(/"([\w-]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...slugs].sort(), [...BOT_FILL_RECIPES].sort());
  for (const slug of slugs) {
    const ctx = { managed: true, partyId: "community-12345678", name: "Community", settings: { maxPlayers: 12, botFill: 6 } };
    assert.equal(botFillCount(slug, ctx), 6, `${slug} accepts botFill`);
    const args = recipes[slug].args(27030, ctx).join(" ");
    assert.match(args, /bot_quota 6|tf_bot_quota 6|minplayers 6|bot_minplayers 6|g_bot_defaultFill 3/, `${slug} passes the fill`);
    assert.doesNotMatch(recipes[slug].args(27030, { ...ctx, settings: { maxPlayers: 12 } }).join(" "), /bot_quota|minplayers|defaultFill/);
  }
});
