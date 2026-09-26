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
  type ControlChannel,
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

function commandFor(def: ServerSettingDefinition, value: ServerSettingValue, channel?: ControlChannel): string {
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
  // Source has no `set`: a cvar is assigned by naming it.
  if (channel === "rcon-source") return `${def.rcon?.cvar || def.key} "${text}"`;
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
    out.push({ key: def.key, command: commandFor(def, value, profile.controlChannel) });
  }
  return out;
}

/*
 * Customer console guard (PlayBound Dedicated).
 *
 * The console is a game console, not a shell, but a Quake 3 console can still
 * undo the product: raise sv_maxclients past the paid slot count, change or
 * blank the rcon password so PlayBound loses control, point the filesystem
 * elsewhere, or quit the process behind reconcile's back. Those are refused;
 * everything else a server admin would type goes through.
 *
 * `;` and newlines are refused outright because the engine splits one rcon
 * line into several commands on them, which would walk straight past a check
 * of the first word.
 */
const BLOCKED_COMMANDS = new Set([
  "quit", "exit", "killserver", "exec", "writeconfig", "cvar_restart", "vstr", "bind", "unbindall",
  "rcon", "connect", "reconnect", "disconnect", "spdevmap", "devmap", "fs_restart", "game_restart", "wait",
]);
const PROTECTED_CVARS = [
  /^rconpassword$/, /^sv_maxclients$/, /^sv_privateclients$/, /^sv_privatepassword$/, /^dedicated$/,
  /^sv_hostname$/, /^sv_master\d*$/, /^net_/, /^fs_/, /^com_/, /^sv_pure$/, /^sv_allowdownload$/, /^sv_dlurl$/,
];
const SET_COMMANDS = new Set(["set", "seta", "sets", "setu", "reset", "unset", "toggle", "cvarlist_set"]);

/** Why a customer console command is refused, or null if it may be sent. */
export function consoleCommandProblem(raw: string): string | null {
  const command = String(raw ?? "").trim();
  if (!command) return "Type a command.";
  if (command.length > 200) return "Commands are limited to 200 characters.";
  if (/[;\r\n]/.test(command) || /[\u0000-\u001f\u007f]/.test(command)) return "Send one command at a time.";
  const [first = "", second = ""] = command.split(/\s+/);
  const verb = first.toLowerCase().replace(/^[\/]/, "");
  if (BLOCKED_COMMANDS.has(verb)) return `"${verb}" isn't available from the PlayBound console.`;
  const cvar = SET_COMMANDS.has(verb) ? second.toLowerCase() : verb;
  if (PROTECTED_CVARS.some((re) => re.test(cvar))) {
    return cvar === "sv_hostname"
      ? "Rename the server from its Settings instead, so PlayBound shows the same name."
      : `"${cvar}" is managed by PlayBound and can't be changed from the console.`;
  }
  return null;
}

/* ── Per-engine live control (verified against real servers on the VPS) ── */

export interface StatusPlayer {
  /** What kick/ban address this client by: client number (Quake), # number (DarkPlaces) or userid (Source). */
  id: string;
  name: string;
  pingMs: number | null;
  score: number | null;
  /** IP without port, for bans. Null for bots and anything unreadable. Never shown to moderators. */
  address: string | null;
  bot: boolean;
}

const IP_PORT = /(\d{1,3}(?:\.\d{1,3}){3}):\d+/;
const clean = (name: string) => name.replace(/\^./g, "").trim();

/**
 * Players from a `status` reply, for the engine the server speaks.
 *
 * Quake 3 rows differ by game: ET prints a `lastmsg` column before the
 * address, OpenArena does not (and colours the address `^7`), so the header
 * decides which layout to match. DarkPlaces puts the address on the line
 * after each player. Source games print quoted names; CS2 quotes with `'` and
 * lists players after a `---players---` rule.
 */
export function parseStatus(channel: ControlChannel | undefined, text: string): StatusPlayer[] {
  const lines = String(text || "").split(/\r?\n/);
  const out: StatusPlayer[] = [];
  if (channel === "rcon-darkplaces") {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^#(\d+)\s+(.*?)\s+(-?\d+)\s+\d+:\d{2}(?::\d{2})?\s*$/);
      if (!m) continue;
      const next = (lines[i + 1] || "").trim();
      const bot = /botclient/i.test(next) || /^\[BOT\]/.test(clean(m[2]));
      out.push({ id: m[1], name: clean(m[2]), score: Number(m[3]), pingMs: null, bot, address: bot ? null : next.match(IP_PORT)?.[1] ?? null });
    }
    return out;
  }
  if (channel === "rcon-source") {
    for (const line of lines) {
      // TF2: #  userid "name" uniqueid [connected ping loss] state [adr]
      const tf = line.match(/^#\s+(\d+)\s+"(.*)"\s+(\S+)(.*)$/);
      if (tf) {
        const bot = tf[3] === "BOT";
        const ping = tf[4].match(/^\s+\S+\s+(\d+)\s+\d+\s+\w+/);
        out.push({ id: tf[1], name: clean(tf[2]), score: null, pingMs: ping ? Number(ping[1]) : null, bot, address: bot ? null : tf[4].match(IP_PORT)?.[1] ?? null });
        continue;
      }
      // CS2:   id  time  ping loss state rate [adr] 'name'
      const cs = line.match(/^\s*(\d+)\s+(BOT|\d+:\d+(?::\d+)?)\s+(\d+)\s+\d+\s+\w+\s+\d+\s+(?:(\S+)\s+)?'(.*)'\s*$/);
      if (cs) {
        const bot = cs[2] === "BOT";
        out.push({ id: cs[1], name: clean(cs[5]), score: null, pingMs: bot ? null : Number(cs[3]), bot, address: bot ? null : (cs[4] || "").match(IP_PORT)?.[1] ?? null });
      }
    }
    return out;
  }
  // Quake 3 family.
  const hasLastmsg = lines.some((l) => /\blastmsg\b/i.test(l));
  const row = hasLastmsg
    ? /^\s*(\d+)\s+(-?\d+)\s+(\d+)\s+(.*?)\s+\d+\s+(?:\^\d)?(\S+)/
    : /^\s*(\d+)\s+(-?\d+)\s+(\d+)\s+(.*?)\s+(?:\^\d)?(\d{1,3}(?:\.\d{1,3}){3}:\d+|bot|loopback)\b/i;
  for (const line of lines) {
    const m = line.match(row);
    if (!m) continue;
    const name = clean(m[4]);
    if (!name) continue;
    const bot = /^bot$/i.test(m[5]);
    out.push({ id: m[1], name, score: Number(m[2]), pingMs: Number(m[3]), bot, address: bot ? null : m[5].match(IP_PORT)?.[1] ?? null });
  }
  return out;
}

/** The map the server is on, from the same `status` reply. */
export function parseCurrentMap(channel: ControlChannel | undefined, text: string): string | null {
  const t = String(text || "");
  if (channel === "rcon-source") {
    return t.match(/^map\s*:\s*(\S+)/m)?.[1] ?? t.match(/spawngroup\(\s*1\)\s*:\s*SV:\s*\[1:\s*([^\s|\]]+)/)?.[1] ?? null;
  }
  return t.match(/^map:\s*(\S+)/m)?.[1] ?? null;
}

const CLIENT_ID = /^\d{1,4}$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function kickCommand(channel: ControlChannel | undefined, id: string): string {
  if (!CLIENT_ID.test(id)) throw new UnsafeSettingValue("player");
  if (channel === "rcon-darkplaces") return `kick # ${id}`;
  if (channel === "rcon-source") return `kickid ${id}`;
  return `clientkick ${id}`;
}

/** Commands that ban an IP for as long as the server runs (PlayBound re-applies them on every start). */
export function banCommands(channel: ControlChannel | undefined, ip: string): string[] {
  if (!IPV4.test(ip)) throw new UnsafeSettingValue("address");
  if (channel === "rcon-darkplaces") return [`ban ${ip} 315360000 PlayBound`];
  if (channel === "rcon-source") return [`addip 0 ${ip}`];
  return [`addip ${ip}`];
}

/**
 * Commands that lift a ban on a running server, or null when the engine cannot
 * (Xonotic unbans by list index, which it only prints to its own log) — the
 * ban then lifts at the next restart, since PlayBound re-applies only its list.
 */
export function unbanCommands(channel: ControlChannel | undefined, ip: string): string[] | null {
  if (!IPV4.test(ip)) throw new UnsafeSettingValue("address");
  if (channel === "rcon-darkplaces") return null;
  return [`removeip ${ip}`];
}

type MapSpec = NonNullable<import("./settings").ServerSettingProfile["maps"]>;

function checkedMap(spec: MapSpec, map: string): string {
  if (!spec.options.some((o) => o.value === map)) throw new UnsafeSettingValue("map");
  return map;
}

export function changeMapCommand(spec: MapSpec, map: string): string {
  return spec.changeCommand.replace("{value}", checkedMap(spec, map));
}

export function nextMapCommand(spec: MapSpec, map: string): string | null {
  return spec.nextCommand ? spec.nextCommand.replace("{value}", checkedMap(spec, map)) : null;
}

/**
 * Commands that install a map rotation, starting from the next map change.
 * Quake 3 keeps it as a chain of vstr cvars, each loading its map and pointing
 * `nextmap` at the following link; DarkPlaces has a native map list.
 */
export function rotationCommands(spec: MapSpec, maps: string[]): string[] {
  const list = maps.map((m) => checkedMap(spec, m));
  if (!list.length || !spec.rotation) return [];
  if (spec.rotation === "darkplaces-maplist") {
    return [`set g_maplist "${list.join(" ")}"`, `set g_maplist_shuffle 0`];
  }
  const cmds = list.map((m, i) => `set pb_rot${i} "map ${m}; set nextmap vstr pb_rot${(i + 1) % list.length}"`);
  return [...cmds, `set nextmap "vstr pb_rot0"`];
}
