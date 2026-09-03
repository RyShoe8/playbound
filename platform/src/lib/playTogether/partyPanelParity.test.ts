import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PARTY_COPY } from "./partyActions";

/**
 * The guard that keeps the two party panels in step.
 *
 * They are separate renderings — an Electron renderer building HTML strings and
 * a React component — so nothing can make them literally identical. What can be
 * enforced is that neither one re-authors a decision `partyActions` already
 * made: the moment a label is typed into a panel rather than read from the
 * resolver, the two can say different things, which is exactly how the web
 * panel ended up a release behind.
 *
 * These read the real files. That makes them slower than a unit test and
 * occasionally in need of a path update, which is the price of catching the
 * thing that actually went wrong.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const WEB = join(REPO, "platform", "src", "components", "friends", "PartyView.tsx");
const STYLE = join(REPO, "platform", "src", "components", "friends", "partyActionStyle.tsx");
const LAUNCHER = join(REPO, "launcher", "renderer", "views", "friends.js");

const read = (p: string) => readFileSync(p, "utf8");

/**
 * The file with its comments removed.
 *
 * Both panels discuss these labels in prose — "the leader gets Join Game",
 * "the server is the last thing settled before Join Game" — and counting raw
 * occurrences reported seventeen hits for one live use. Only what survives
 * here can actually reach a player.
 */
function code(path: string): string {
  return read(path)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[^\n]*?\/\/[^\n"'`]*$/gm, " ");
}

/**
 * Just the party card, from a file that holds the whole friends view.
 *
 * Scoped because friends.js legitimately says "Join Game" elsewhere — status
 * toasts like "try Join Game again", and a different component's fallback
 * label. Those name the button; they do not re-author it. Checking the whole
 * file confused the two.
 */
function launcherPartyCard(): string {
  const src = code(LAUNCHER);
  const start = src.indexOf("function buildPartyViewHtml(");
  expect(start, "buildPartyViewHtml has moved — update this guard").toBeGreaterThan(-1);
  let depth = 0;
  let i = src.indexOf("{", start);
  const open = i;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  expect(i, "buildPartyViewHtml braces did not balance").toBeGreaterThan(open);
  return src.slice(start, i + 1);
}

/** Copy the resolver owns. A panel that spells any of these has forked it. */
const OWNED: Array<keyof typeof PARTY_COPY> = [
  "readyUp",
  "cancelReady",
  "startGame",
  "joinGame",
  "waitingForHost",
  "serverStarting",
  "hostMustStart",
  "serverStillStarting",
  "couchLeaderNext",
  "couchMemberNext",
  "lanPending",
  "hostedPending",
];

describe("party panel parity", () => {
  it("the web panel authors none of the resolver's copy", () => {
    const src = code(WEB);
    const offenders = OWNED.filter((key) => src.includes(PARTY_COPY[key]));
    expect(
      offenders,
      `PartyView.tsx spells copy that partyActions owns — render party.actions instead: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("the launcher authors none of the resolver's copy", () => {
    const src = launcherPartyCard();
    const offenders = OWNED.filter((key) => src.includes(PARTY_COPY[key]));
    expect(
      offenders,
      `friends.js spells copy that partyActions owns — render party.actions instead: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("both panels read the resolved action bar rather than recomputing it", () => {
    expect(code(WEB)).toContain("actions.join");
    expect(code(WEB)).toContain("actions.ready");
    expect(code(LAUNCHER)).toContain("party.actions");
    expect(code(LAUNCHER)).toContain("actions.join");
  });

  /*
   * Tones and icons are the other half of the shared vocabulary. A name the
   * resolver can emit but a panel cannot render produces a silently unstyled
   * button, which no copy check would catch.
   */
  it("both panels can render every tone the resolver emits", () => {
    for (const tone of ["primary", "secondary", "success", "danger", "muted"]) {
      expect(read(LAUNCHER), `the launcher's PARTY_TONE is missing ${tone}`).toMatch(
        new RegExp(`${tone}:\\s*"btn-`)
      );
      expect(read(STYLE), `partyActionStyle is missing ${tone}`).toMatch(
        new RegExp(`${tone}:\\s*"`)
      );
    }
  });

  it("both panels can render every icon the resolver emits", () => {
    const style = read(STYLE);
    const launcher = read(LAUNCHER);
    for (const icon of ["play", "loader", "check", "x", "phone", "logout", "crown"]) {
      expect(style, `partyActionStyle has no mapping for ${icon}`).toMatch(
        new RegExp(`${icon}:\\s*[A-Z]`)
      );
      expect(launcher, `the launcher's ICON set has no ${icon}`).toMatch(
        new RegExp(`\\b${icon}:\\s*\``)
      );
    }
  });
});
