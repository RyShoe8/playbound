/**
 * Plain-launch argument handling.
 *
 * Clicking Play with no server to join used to pass any connect-arg element
 * that had no placeholder in it. That splits flag/value pairs: Unvanquished's
 * ["+connect", "{host}:{port}"] became a bare `+connect`, and the engine
 * rejected it — `URL "+connect" contains forbidden character '+'` — so the
 * game never started. Twelve hosted games have that shape and only survived
 * because their engines ignore a dangling flag.
 *
 * Run: node services/connectArgs.test.js
 */

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  CLIENT_CONNECT_ARGS,
  applyConnectTemplates,
  defaultGamePort,
  joinsFromInGameMenu,
  staticLaunchArgs,
  arbiterLaunchArgs,
  hasArbiterLaunch,
  clientConnectArgs,
} = require("./connectArgs");

test("a templated pair contributes nothing to a plain launch", () => {
  // The reported case.
  assert.deepEqual(staticLaunchArgs(["+connect", "{host}:{port}"]), []);
  // Same shape, different engines.
  assert.deepEqual(staticLaunchArgs(["-n", "{host}:{port}"]), []);
  assert.deepEqual(staticLaunchArgs(["--host", "{host}:{port}"]), []);
  assert.deepEqual(
    staticLaunchArgs(["--go", "--address", "{host}", "--port", "{port}"]),
    []
  );
});

test("genuinely static args still apply", () => {
  // P99's patchme: no placeholder anywhere, so it is a real launch flag.
  assert.deepEqual(staticLaunchArgs(["patchme"]), ["patchme"]);
  assert.deepEqual(staticLaunchArgs(["-windowed", "-novid"]), ["-windowed", "-novid"]);
});

test("empty and missing inputs are safe", () => {
  assert.deepEqual(staticLaunchArgs(null), []);
  assert.deepEqual(staticLaunchArgs(undefined), []);
  assert.deepEqual(staticLaunchArgs([]), []);
  assert.deepEqual(staticLaunchArgs("+connect"), []);
});

test("no shipped connect list leaks a flag into a plain launch", () => {
  // Every entry in the table is a join line; none should survive a plain Play.
  for (const [slug, templates] of Object.entries(CLIENT_CONNECT_ARGS)) {
    if (!Array.isArray(templates)) continue;
    assert.deepEqual(
      staticLaunchArgs(templates),
      [],
      `${slug} would pass ${JSON.stringify(staticLaunchArgs(templates))} on a plain launch`
    );
  }
});

test("joining still substitutes the address", () => {
  assert.deepEqual(
    applyConnectTemplates(["+connect", "{host}:{port}"], { host: "1.2.3.4", port: 27960 }),
    ["+connect", "1.2.3.4:27960"]
  );
  assert.deepEqual(
    applyConnectTemplates(["--go", "--address", "{host}", "--port", "{port}"], {
      host: "10.0.0.5",
      port: 30000,
    }),
    ["--go", "--address", "10.0.0.5", "--port", "30000"]
  );
});

test("new peer-hosted games expose the address and port their launch path needs", () => {
  assert.equal(joinsFromInGameMenu("dune-legacy"), true);
  assert.equal(defaultGamePort("dune-legacy"), 28747);
  assert.equal(defaultGamePort("openmohaa"), 12203);
  assert.deepEqual(
    applyConnectTemplates(CLIENT_CONNECT_ARGS.openmohaa, {
      host: "100.64.0.2",
      port: 12203,
    }),
    ["+connect", "100.64.0.2:12203"]
  );
});

test("every shipped list resolves to a complete join line", () => {
  for (const [slug, templates] of Object.entries(CLIENT_CONNECT_ARGS)) {
    if (!Array.isArray(templates)) continue;
    const args = applyConnectTemplates(templates, { host: "1.2.3.4", port: 1234 });
    assert.equal(args.length, templates.length, `${slug} lost an argument`);
    for (const a of args) {
      assert.ok(!/\{(host|port|name|mod)\}/.test(a), `${slug} left a placeholder in ${a}`);
    }
  }
});

test("openra join substitutes the target mod and address", () => {
  assert.deepEqual(
    applyConnectTemplates(CLIENT_CONNECT_ARGS.openra, { host: "147.93.133.235", port: 1234 }),
    ["Game.Mod=ra", "Launch.Connect=147.93.133.235:1234"]
  );
  assert.deepEqual(
    applyConnectTemplates(
      CLIENT_CONNECT_ARGS.openra,
      { host: "147.93.133.235", port: 1234 },
      "tiberian-dawn"
    ),
    ["Game.Mod=cnc", "Launch.Connect=147.93.133.235:1234"]
  );
  assert.deepEqual(
    applyConnectTemplates(
      CLIENT_CONNECT_ARGS.openra,
      { host: "147.93.133.235", port: 1234 },
      "dune-2000"
    ),
    ["Game.Mod=d2k", "Launch.Connect=147.93.133.235:1234"]
  );
});

/**
 * ECWolf has no dedicated server: the host is a player. Getting this wrong is
 * silent — the leader launches a perfectly good single-player game, nothing
 * listens, and every joiner's --join dials a machine that is not in a session.
 */
test("a peer game's host launches differently from its joiners", () => {
  assert.ok(hasArbiterLaunch("wolfenstein"), "ECWolf hosts from a player's own game");
  assert.deepEqual(
    applyConnectTemplates(arbiterLaunchArgs("wolfenstein"), { nodes: 4 }),
    ["--host", "4"],
    "the arbiter waits for the party"
  );
  // Two is the floor: a one-node multiplayer game never starts.
  assert.deepEqual(applyConnectTemplates(arbiterLaunchArgs("wolfenstein"), {}), ["--host", "2"]);
  assert.deepEqual(
    applyConnectTemplates(arbiterLaunchArgs("wolfenstein"), { nodes: 1 }),
    ["--host", "2"]
  );
});

test("a game with a real dedicated server has no arbiter launch", () => {
  // The flag decides whether the leader's own game is the server. Claiming it
  // for a game PlayBound hosts would launch the client with flags meant for a
  // host that already exists elsewhere.
  assert.equal(hasArbiterLaunch("openarena"), false);
  assert.equal(hasArbiterLaunch("veloren"), false);
  assert.equal(arbiterLaunchArgs("openra"), null);
});

test("both spellings of the Wolfenstein 3D slug join the same way", () => {
  // The adapter registry calls it "wolfenstein"; the catalog row for a game
  // still in testing may not. A missed alias here is a silent no-join.
  for (const slug of ["wolfenstein", "wolfenstein-3d"]) {
    assert.deepEqual(clientConnectArgs(slug), ["--join", "{host}"], slug);
    assert.equal(defaultGamePort(slug), 5029, slug);
    assert.ok(hasArbiterLaunch(slug), slug);
  }
});
