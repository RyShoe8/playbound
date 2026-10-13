# RimWorld Together bridge

This is for the catalog edition `rimworld:rimworld-together`, not vanilla
RimWorld or the unrelated `rwmt/Multiplayer` mod. The server recipe is
`rimworld-together`.

`build-server.ps1 -WorkDirectory <fresh absolute directory>` fetches upstream
commit `bbd981f3b01255198a66bd8fb6c57ed0595c8db4` (26.8.31.1) and compiles
`PlayBoundBridge.cs` into its Linux server. It requires Git and .NET 8 or later.
The client and network protocol are unchanged. Keep upstream LICENSE with the
published binary; the reproducible patch and build instructions live here.

The bridge writes a process-owned, timestamped player snapshot every second.
The agent rejects samples older than ten seconds and samples from another PID.
Counts include connecting clients, conservatively protecting a joining player.
Private player addresses are used for moderation internally and omitted from
public player-list responses. `pbkick` takes a base64 username so names with
spaces cannot be mistaken for console arguments.

The agent's private FIFO survives its own restart. Configs, Assets, and Backups
stay inside each server's data directory. Runtime IDs and ports may change;
the CommunityServer identity does not. Settings apply on restart; console
actions are live. Party commands require membership, and writes require the
leader. Parties on public servers cannot control those servers. Customer
servers use the existing permission checks and adapters. Destructive world
reset commands and service configuration bypasses are refused.

Controls include slot limits, descriptions, chat notices, backup scheduling,
client-save policy, mod enforcement, storyteller and native difficulty fields.
The console supports player/account listing, kick/ban/pardon, operator changes,
forced saves, backups, broadcasts, events, and passwords. Password command
arguments are redacted from the customer activity log. There are no player
bots; the first client creates a world instead of selecting a rotating map.

## Verification (2026-10-13)

An isolated VPS agent started the patched server, read a real zero-player
snapshot with a four-slot limit, issued native console commands, restarted the
agent, adopted the same server PID, issued another command through the restored
FIFO, stopped the runtime, and confirmed its PID was gone. No catalog rows or
unrelated worlds were modified.

A real TCP probe also verified the snapshot changes from 0 to 1 and back to 0
when the connection closes. An unhandshaken connection remains counted until
the upstream listener's keepalive timeout expires; it is never optimistically
treated as an empty server while the engine still considers it connected.

The upstream browser at 66.29.129.72:7778 accepts TCP but did not return its
handshake/listing within the bounded timeout. This is reported as unavailable,
never an empty successful list; healthy PlayBound-owned discovery remains
independent. Browser successes and failures are coalesced/cached for 60 seconds.
An actual licensed client Join, populated player-count test, save/restore, and
occupied resource measurements remain release verification steps. Do not
claim these tests passed or automatically enroll the profile based on startup.
