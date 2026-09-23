import { test } from "node:test";
import assert from "node:assert/strict";

test("a non-native OutRun profile offers PlayBound Controls instead of forcing keyboard", async () => {
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  let chooseController;
  let bridgeStarts = 0;
  const playCalls = [];
  const controllerButton = {
    getAttribute: () => "controller",
    addEventListener: (_event, callback) => { chooseController = callback; },
  };
  const root = {
    classList: { add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {},
    querySelectorAll: () => [controllerButton],
    innerHTML: "",
  };
  try {
    globalThis.document = {
      getElementById: () => null,
      createElement: () => root,
      body: { appendChild() {} },
    };
    globalThis.window = {
      playbound: {
        couchState: async () => ({ active: false }),
        getPlayBoundControlsAvailability: async () => ({ available: true }),
        getControllerSupport: async () => ({ kind: "unsupported" }),
        stopGamepadBridge: async () => {},
        startGamepadBridge: async () => { bridgeStarts++; return { ok: true }; },
      },
    };
    const { maybeOfferPhoneControllerThenPlay } = await import(`./phoneController.js?profile-choice=${Date.now()}`);
    const launch = maybeOfferPhoneControllerThenPlay(
      { title: "OutRun", gameSlug: "outrun" },
      async (opts) => playCalls.push(opts),
      "outrun",
    );
    for (let i = 0; i < 10 && !chooseController; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(typeof chooseController, "function", "controller choice should be offered");
    assert.match(root.innerHTML, /PlayBound Controls/);
    assert.doesNotMatch(root.innerHTML, /data-choice="phone"/);
    chooseController();
    assert.equal(await launch, true);
    assert.deepEqual(playCalls, [{ inputMode: "controller" }]);
    assert.equal(bridgeStarts, 0, "keyboard synthesis must not start the virtual controller bridge");
  } finally {
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
});
