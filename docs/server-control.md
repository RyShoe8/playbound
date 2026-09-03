# Server Control

The layer above a running game server: read its state, change its settings, and put
that in front of the player — hosted on the VPS or self-hosted on their own PC, same UI.

[PlayBound Connect](playbound-connect.md) gets people *into* a room. Server Control is
what they can do to the room once they are in it. Read that file first; this one assumes it.

All six slices are built (see the bottom of this file). Slice 5 changed what
self-hosting means along the way — the launcher now owns a dedicated server rather than
waiting for a player to host from a game's menus.

Nothing has yet run against a live party. Every seam is unit-tested and the overlay's
three apply modes have been driven in a browser against the real schema, but no room has
ever been changed by any of it.

## What already exists — do not rebuild it

Half of the proposed architecture is in the tree under different names.

| Proposed | Already is |
|---|---|
| "Hosted vs local adapter" | [`hostModes.ts`](../platform/src/lib/multiplayer/hostModes.ts) — Connect already answers where a party's server runs (public list / VPS / host's PC) in one place, for site, launcher and admin alike |
| "Server provider" | The game-host agent on the VPS: `POST GAME_HOST_URL/rooms`, `GET /rooms`, `DELETE /rooms/:id`, `/health`, `/metrics` ([`game-host/index.js`](../platform/game-host/index.js)) |
| "Startup variables" | [`recipes.js`](../platform/game-host/recipes.js) — argv, config files and stdin per game, already parameterised by `ctx` |
| "Server capability registry" | [`adapters.ts`](../platform/src/lib/multiplayer/adapters.ts) — five adapter types, `HostLaunchConfig`, `SelfHostConfig`, port/protocol per game |
| "Permission model" | `Party.role` / `leaderId` / host mode in [`models/Party.ts`](../platform/src/lib/models/Party.ts) |
| "Controller shortcut" | [Couch Mode](couch-mode.md) already owns pad input and its transport |

What did not exist when this was written: **any control channel at all.** The agent could
start a room and kill a room, and nothing more — no RCON anywhere in the repo. Everything
below is about closing that gap, and slices 1–4 have now closed it for two games.

## Decision: no Pterodactyl, for now

Pterodactyl's model does map onto this — Panel, Wings, per-server containers, Eggs with
editable startup variables. It is a reasonable thing to want. It is also a replacement
for something already running in production and already spawning these exact games.

Adopting it would mean standing up Panel + Wings + Docker, porting every recipe to an
Egg, and holding admin credentials that must never reach a launcher. The return is
orchestration we already have.

The part of the proposal worth keeping is the *seam*, not the vendor. Define
`ServerControlAdapter`, implement it twice over what exists, and Pterodactyl (or AMP, or
a third-party host) becomes an afternoon later instead of a rewrite.

Revisit when one of these is true, not before:

- more than one node, or per-server CPU/RAM limits that need enforcing
- servers that outlive a party and need their own billing and lifecycle
- letting someone bring their own host

## The seam

```
                    PlayBound UI  (site · launcher · overlay)
                             │
                    Server Control API
                             │
              ┌──────────────┼──────────────┐
       VpsAgentAdapter   LocalAdapter   (later: Pterodactyl, AMP)
       game-host/rooms   launcher child
       + RCON            process + RCON
```

```ts
interface ServerControlAdapter {
  getStatus(): Promise<ServerRuntimeState>;
  getPlayers(): Promise<ServerPlayer[]>;
  getSettings(): Promise<ServerSettingValues>;
  applySettings(values: Partial<ServerSettingValues>): Promise<ApplyResult>;
  restart(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendCommand(raw: string): Promise<string>;   // advanced surface only
}
```

`sendCommand` is deliberately last and deliberately gated. A console is a debugging
tool and an admin escape hatch, never the primary UI.

## Settings are declared, not hard-coded

This is the foundation, and most of it is already written — as literals.

`buildWarzoneAutohostConfig` in `recipes.js` hard-codes `map: "Sk-Mountain"`,
`maxPlayers: 8`, `techLevel: 1`, `bases: 2`, `scavengers`, `alliances`,
`openSpectatorSlots`. Teeworlds writes a generated `.cfg`. Those are server settings.
Today a party leader cannot touch any of them, and the UI could not render them if they
could, because nothing declares that they exist.

So: promote the literals to a declared per-game schema, and generate the UI from it.

```ts
{ key: "maxPlayers", label: "Max players", type: "number", min: 2, max: 32,
  apply: "restart", backend: "startup" }

{ key: "friendlyFire", label: "Friendly fire", type: "boolean",
  apply: "live", backend: "rcon" }
```

`apply` is the field that earns its place. Three values, and the UI reads them:

- `live` — takes effect now
- `next-round` — queued, takes effect at the next round or map change
- `restart` — needs the process restarted, which disconnects everyone

That last one is why it must be in the data model rather than in a comment: the overlay
has to be able to say *"Changing max players restarts the server. 7 players are
connected."* before it does it, and it can only know that from the schema.

A game declares only what it supports. Anything undeclared does not render — the same
principle as the adapter rows, where absence is meaningful.

## Three answers, not two

Absence is meaningful, but it is ambiguous, and the ambiguity is expensive.

Freeciv generates one map at the start of a game and plays it to the end. "Change map"
is not missing from PlayBound's coverage of Freeciv — it is missing from Freeciv. That
reads identically to a game nobody has assessed yet, and the two are opposite
instructions to whoever picks this up next: one is finished work, the other is a to-do.

So settings carry a `feature` tag from a shared vocabulary — `map`, `gameMode`, `slots`,
`bots`, `friendlyFire`, `timeLimit`, `password`, `restart` — and a profile can record
what a game *cannot* have, with the reason:

```ts
unavailable: {
  map: "A Freeciv game is played on one map generated at the start; there is no next map to pick.",
}
```

`controlFeatureSupport(slug)` then answers per concept with `supported` (and what it
costs), `unavailable` (and why), or `unassessed`. The tag is what makes the concept
survive being spelled differently per game: Warzone's `maxPlayers` and ET's
`sv_maxclients` are one question asked twice, and only the tag knows that.

A profile with no settings is worth writing for exactly this reason. Freeciv has one.

This is also the intelligence a game page needs to claim anything about server controls,
and the check to run when adding a game: what can this server be told, what can it never
be told, and which is which.

### Games this cannot reach

Every hostable game supports the `dedicated` host mode, so server control reaches all 28
of them. Three inconsistencies in the surrounding catalog data are worth knowing about,
because none of them is visible from inside this feature:

- **Teeworlds has a recipe and a profile but is not hostable.** The agent writes a
  six-value config file for it, and `settings.ts` declares all six — but the slug is
  absent from `HOSTABLE_GAMES` and its adapter row says `official`, so nothing ever asks
  for a Teeworlds room. `settings.test.ts` lists it under `READY_BUT_NOT_HOSTED` so the
  dead profile is visible rather than quietly unreachable.
- **BZFlag is hostable but its adapter says `official`**, which means leave the game own
  networking alone. It has a recipe, a connect-args entry and a settings profile, and its
  default host mode is `dedicated`. The adapter row looks like the stale half.
- **SuperTuxKart and Zero-K are hostable with `virtual-lan` adapters**, which by
  definition have no server to spawn and no address to pass. Both have spawn recipes.

None of these is a server-control bug and none is fixed here: changing them changes how
a game is hosted, which is the five-step job in playbound-connect.md, not a data tidy.

### Coverage

`settings.test.ts` walks every entry in `HOSTABLE_GAMES` and fails unless each one has
either a profile or a line in its `UNASSESSED` list saying what is missing. A new
hostable game cannot slip in with no server controls and no note about why.

Where it stands: **every hostable game but one is profiled** — 17 with settings (56 in
total), 12 assessed as having nothing a server can be told. Two speak a live control
channel: Wolfenstein: Enemy Territory and OpenArena, both Quake 3 engines.

The exception is Mindustry, and it is blocked rather than unexamined: it is configured
over stdin with `host <map> <mode>`, and the mode cannot be given without naming a map.
It needs the GameMap entity before it needs anything here.

Profiles come from evidence, never from memory. In order of preference:

1. **A literal already in the recipe.** Teeworlds declares six settings because
   `prepareSpawn` writes six literals into a config file; BZFlag declares two because
   `-mp 8` and `+s 10` are in its argv.
2. **The project's own published configuration.** Xonotic's cvars are the ones in its
   `server.cfg` — `maxplayers`, not `sv_maxclients`, and the `_override` limits,
   because the plain ones apply only mid-match. OpenArena's gametype numbers and
   OpenRA's `Server.*` settings were read the same way.
3. **An assessment that a concept cannot exist**, which is a result in its own right.

Two shapes of profile are worth calling out.

**Freedoom is Zandronum.** The game is the data; the server that hosts it is a source
port, and the default edition is `zandronum`, so the profile is Zandronum's cvars. Its
game mode is the awkward part — the engine has no single mode variable, just a boolean
per mode with cooperative as the absence of all of them — so the schema declares one
enum, which is what a host is actually choosing, and `freedoomSettingArgs` in the recipe
does the spelling. Chocolate Doom, one of the seven binaries that recipe can land on,
understands none of it and keeps the plain args it always had.

**Some servers relay a game rather than run one.** wesnothd is a lobby that clients
create games inside; hedgewars-server carries rooms whose owner picks the map in the
game's own screen; fgms forwards aircraft positions and has no notion of a match. Those
are not games waiting for someone to declare their settings — the server genuinely has
none, and recording that is the result.

**Twelve games have no settings, and that is the answer.** Some relay a match rather than
run one; others set the match up inside the game once everyone has arrived — Re-Volt in
its lobby, TripleA when the host picks a game file, YSoccer in the online lobby, Hurry
Curry when players choose a restaurant. Freeciv, OpenTTD, Luanti and Veloren each carry
one world for the life of the game. None of those is a gap.

Two things stayed out of profiles on purpose wherever they came up. A **join password**,
because the launcher's connect args carry none and setting one locks the party out of
its own room. And a **server name**, because the party already names the room — a second
channel for one value is the mistake `maxPlayers` made against the agent for months.

## Two phases, and only one of them costs anything

Settings are offered **before** the room starts as well as while it runs, and the
difference is not cosmetic. `serverControlAvailability` returns a `phase`:

- `pre-launch` — no room has been asked for yet. Values are written to
  `party.hosted.settings` and handed to the agent by `provisionPartyHost` at spawn.
  Nothing restarts, nobody is disconnected, and the panel shows neither warning.
  There is no adapter in this phase; `createPartyServerAdapter` returns null,
  because there is no process to adapt.
- `live` — the room exists. Every change costs whatever the schema says it costs,
  which today is usually a restart that drops the party.

The pre-launch phase exists because its absence was a trap. "The room has not started
yet" meant the only way to get a server on the right map was to start one on the wrong
map and then restart it — paying a disconnection to fix something nobody had been
allowed to set. Choosing first is free; the party panel and the overlay both offer it.

Values are re-coerced at spawn rather than trusted, because a profile can change
between the save and the launch. A key the game no longer declares is dropped instead
of being handed to the agent.

## Saying the controls exist

A host cannot use a panel they have never been told about, and the overlay lives behind
a chord. So the party payload carries `serverControl: { supported, phase, reason }`,
resolved server-side for the same reason `hostMode` is — the launcher cannot import the
profiles, and a second implementation of "does this game have controls" is a second
thing to drift.

Both party panels use it to name the shortcut, and only on games that actually have
controls: a note pointing at a panel that would open empty is worse than no note. The
launcher formats the player's *configured* accelerator rather than the default, since
the whole point is telling them which key to press.

## Deferred on purpose

**A `GameMap` entity.** Right now maps come from recipes for a couple of games and are
strings everywhere else. A visual map picker with mod dependencies is the right end
state and the wrong starting point; a `type: "enum"` setting with a declared option list
carries the first several games. Promote to an entity when a game needs images,
per-map modes, or a mod dependency — not before.

**Map voting.** Depends on the map entity and on knowing who is connected. After both.

**Injected overlay.** Not now, and possibly not ever. A transparent, frameless,
always-on-top `BrowserWindow` toggled by a global shortcut covers borderless and
windowed games, which is most of the catalog. Graphics-API hooking buys exclusive
fullscreen at the cost of per-game breakage, crashes, and anti-cheat exposure. If
exclusive fullscreen becomes a real complaint, the answer is a recommendation to run
borderless, not a DLL.

The overlay shortcut must not be `Shift+Tab` — Steam owns that. Default to something
like `Ctrl+\`` and make it configurable. The controller equivalent belongs to Couch
Mode's input layer, not a second pad stack.

## First slice

In order, because each one is load-bearing for the next:

1. ~~**Declare settings for one game.**~~ **Done.**
   [`serverControl/settings.ts`](../platform/src/lib/serverControl/settings.ts) declares
   Warzone 2100's eight settings; `WARZONE_DEFAULT_SETTINGS` in `recipes.js` holds the
   same values for the agent, and `settings.test.ts` reads that object out of the agent's
   source so the two copies cannot drift. The generated challenge JSON is byte-identical
   to what shipped before.
2. ~~**`ServerControlAdapter` + `VpsAgentAdapter`.**~~ **Done.**
   [`adapter.ts`](../platform/src/lib/serverControl/adapter.ts) is the interface and its
   capability flags; [`vpsAgent.ts`](../platform/src/lib/serverControl/vpsAgent.ts)
   implements it over the game-host agent, delivering every change by restart. The agent
   accepts a `settings` object on `POST /rooms`, filters it to the keys its recipe
   declares, and echoes back what the room is actually running. `getPlayers` and
   `sendCommand` throw `ServerControlUnsupported` rather than returning something empty
   and plausible.
3. ~~**Party-window UI generated from the schema.**~~ **Done.**
   [`PartyServerSettings.tsx`](../platform/src/components/friends/PartyServerSettings.tsx)
   renders controls from the definitions alone — no game is named in it — behind
   `GET`/`PATCH /api/parties/:id/server-settings`.
   [`partyServer.ts`](../platform/src/lib/serverControl/partyServer.ts) turns a party
   document into an adapter, or into the reason there is none. Members read; the leader
   writes, because every change available today disconnects the whole room. The panel
   renders nothing when a party has no controllable server.
4. ~~**RCON in one adapter.**~~ **Done.**
   Wolfenstein: Enemy Territory is the first profile with `controlChannel:
   "rcon-quake3"`, so its map and friendly fire apply without dropping anyone.
   [`rcon.ts`](../platform/src/lib/serverControl/rcon.ts) builds the commands and reads
   `status` replies; [`game-host/rcon.js`](../platform/game-host/rcon.js) is the socket,
   on the VPS because the game listens on a UDP port there. The password is generated
   per room by the agent and never leaves it — the platform names a room, not a password,
   so a leaked platform token is not console access.
5. ~~**`LocalAdapter`.**~~ **Done, by route B.** The launcher now spawns and owns a
   dedicated server on the host's PC ([`localServer.js`](../launcher/services/localServer.js)),
   built from the `hostLaunch.argsTemplate` eleven games declared and nothing read.
   [`localAdapter.ts`](../platform/src/lib/serverControl/localAdapter.ts) writes desired
   state and a revision; the launcher reconciles and acks through
   `/api/parties/:id/self-host-server`. Desired state crosses the boundary, never
   commands — the launcher decides how to reach it, so the platform can ask for a
   different map and nothing else.
6. ~~**Overlay window.**~~ **Done.**
   A transparent, frameless, always-on-top `BrowserWindow` on a global shortcut —
   [`overlay.html`](../launcher/renderer/overlay.html) and
   [`overlay.js`](../launcher/renderer/overlay.js), rendered from the same declared
   settings the site panel uses, with no game named in either file. Default chord
   `Ctrl+\``, configurable in launcher Settings. `overlayContext()` picks the party for
   a game that is actually running, and declines to guess between several when nothing
   is. No injection, no hooking, nothing in the game's process.

### Self-hosting changed to make this possible

Slice 5 was written expecting the launcher to be a control plane over a local dedicated
server. It was not. A self-hosted room was **the game's own listen server, started by a
person in a menu** — `reportSelfHostWhenListening` in
[`friends.js`](../launcher/renderer/views/friends.js) waits up to thirty minutes because
"Freeciv can sit at its title screen indefinitely before Start Network Game".

So there was no process PlayBound spawned, no argv it chose, and nothing it could
restart. The choice was to relay rcon commands into the player's own game, or to make
self-hosting mean something we own. It now means the second: for a game with a
`hostLaunch.argsTemplate`, the launcher starts a real dedicated server, which makes every
declared setting deliverable and a restart a genuine control rather than killing the
game the host is playing.

Games without a host template keep the old menu-driven path unchanged, probe and all.

One consequence worth keeping in mind: everything reaches a local server on its command
line, so every change costs a restart even where the game's own schema allows better.
The adapter reports `liveApply: false` and both panels read that rather than the apply
mode alone — a warning promising nobody is disconnected would be worse than none.

### Mixed batches restart

One restart-backed key in a batch and the whole batch restarts, live keys included. The
live half could go over the wire first, but a respawn that then failed would leave the
server holding part of a change the host was told costs one restart. Everything lands
together or not at all.

### One value, one channel

`provisionPartyHost` used to send `maxPlayers: party.maxSize` to the agent, which never
read it — `startRoom` did not destructure it, so it did nothing for as long as it
existed. The dead parameter is gone rather than wired up, because the two are not the
same question: party size is who is in the party, server slots are how many the room
holds, and a three-person party does not want a three-slot server nobody else can join.
Slots are a declared setting and that is the only channel.

Slices 1–3 are the ones that decide whether the abstraction is right. If the schema
cannot express Warzone without an escape hatch, that is the signal to fix the schema —
before five more games and an overlay are sitting on it.
