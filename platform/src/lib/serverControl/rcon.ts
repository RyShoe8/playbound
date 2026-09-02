/**
 * Turning declared settings into Quake 3 rcon, and rcon replies back into facts.
 *
 * Pure on purpose: the socket lives on the VPS agent, because the game server
 * listens on a UDP port on that box and nothing serverless can reach it. What
 * is here is the part worth getting exactly right and testing without a
 * network — what we say to a game server, and what we believe it says back.
 */

import {
  getServerSettingProfile,
  type ServerSettingDefinition,
  type ServerSettingValue,
  type ServerSettingValues,
} from "./settings";

/**
 * A console line is terminated by `;` or a newline, and quoted by `"`. A value
 * carrying any of those stops being a value and becomes a second command, so
 * this is the character set a value may contain — nothing else is escaped, it
 * is refused.
 *
 * Enum and number values are safe by construction, which is why command-applied
 * settings are required to be enums. This exists for the free-text case, so
 * that adding one later cannot quietly open the door.
 */
const SAFE_VALUE = /^[A-Za-z0-9 ._:@#()[\]+-]*$/;

export class UnsafeSettingValue extends Error {
  constructor(key: string) {
    super(`Refusing to send ${key} to a game console: the value contains control characters.`);
    this.name = "UnsafeSettingValue";
  }
}

/** How a cvar wants to see a value: booleans are 1/0, never "true". */
export function rconValue(value: ServerSettingValue): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
}

function commandFor(def: ServerSettingDefinition, value: ServerSettingValue): string {
  const text = rconValue(value);
  if (!SAFE_VALUE.test(text)) throw new UnsafeSettingValue(def.key);

  if (def.rcon?.command) {
    /*
     * A command interpolates its value into a verb, so there is no quoting to
     * hide behind. The schema only allows this for enums — the text came from
     * an option list this file also holds, never from the host — and this
     * assertion is what keeps that true if someone changes the type later.
     */
    if (def.type !== "enum") throw new UnsafeSettingValue(def.key);
    return def.rcon.command.replace("{value}", text);
  }
  return `set ${def.rcon?.cvar || def.key} "${text}"`;
}

/**
 * The rcon commands that deliver these values, in declaration order.
 *
 * Only settings whose backend is `rcon` produce anything: a `startup` or
 * `config-file` value cannot be talked into a running server, and pretending
 * otherwise is how a panel comes to report success on a change that never
 * happened.
 */
export function buildRconCommands(
  slug: string,
  values: ServerSettingValues
): { key: string; command: string }[] {
  const profile = getServerSettingProfile(slug);
  if (!profile) return [];
  const out: { key: string; command: string }[] = [];
  for (const def of profile.settings) {
    if (def.backend !== "rcon") continue;
    const value = values[def.key];
    if (value === undefined) continue;
    out.push({ key: def.key, command: commandFor(def, value) });
  }
  return out;
}

export interface RconPlayerLine {
  name: string;
  id: string | null;
  pingMs: number | null;
  score: number | null;
}

/**
 * Players from a Quake 3 `status` reply.
 *
 * The reply is a header, a rule line, then one row per connected client:
 *
 * ```
 * map: oasis
 * num score ping name            lastmsg address               qport rate
 * --- ----- ---- --------------- ------- --------------------- ----- -----
 *   0    12   48 Ryan^7                0 203.0.113.9:27960      12345 25000
 * ```
 *
 * Names are the awkward part: they carry `^7` colour codes, they can contain
 * spaces, and the columns after the name are what actually delimit it. So the
 * row is matched from both ends rather than split on whitespace.
 */
export function parseQuake3Status(text: string): RconPlayerLine[] {
  const players: RconPlayerLine[] = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    // num, score, ping, then the name, then lastmsg and an address.
    const match = line.match(
      /^\s*(\d+)\s+(-?\d+)\s+(\d+)\s+(.*?)\s+\d+\s+(?:\d{1,3}(?:\.\d{1,3}){3}:\d+|loopback|bot)\s/i
    );
    if (!match) continue;
    const name = match[4].replace(/\^./g, "").trim();
    if (!name) continue;
    players.push({
      name,
      id: match[1],
      score: Number(match[2]),
      pingMs: Number(match[3]),
    });
  }
  return players;
}
