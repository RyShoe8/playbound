# Deus Ex HX dedicated rooms

HX's `HCC.exe` runs a headless co-op server under Wine. The PlayBound agent has
a dedicated recipe for it. The operator-owned Steam game files and HX 0.9.89.4
are provisioned on the VPS; the isolated spawn test bound UDP 7790. A client
join is still the final gameplay verification.

The operator must provide a legitimately acquired, installed **Deus Ex GOTY
1.112fm** directory. A Steam installation is acceptable; GOG is not required.
The provisioning script never downloads or redistributes the paid game. Each
player still needs their own copy for the HX client edition.

1. Install Deus Ex GOTY from Steam on a Windows PC. Check for
   `System/DeusEx.exe`, `System/DeusEx.u`, and
   `Maps/01_NYC_UNATCOIsland.dx` inside the install directory.
2. Transfer that *installed game directory* privately to a temporary directory
   on the VPS. Do not put it in Blob, R2, the public mirror, or Git.
3. On the VPS, deploy the updated agent with `sudo bash platform/game-host/install.sh`
   from the repository checkout. Then run
   `sudo bash platform/game-host/provision-deus-ex-hx.sh /private/path/to/DeusEx`.
   The script installs Wine, copies the owned game files to
   `/opt/playbound-host/games/deus-ex`, verifies and applies Hanfling's HX
   0.9.89.4 archive, and creates the headless Wine wrapper.
4. Restart `playbound-game-host`. Check `/health` for
   `gameStatus.deus-ex-goty-edition.ready=true`. Run the agent's `POST /test-spawn` for
   `gameSlug=deus-ex-goty-edition`; it must bind a gameplay port. Join from a Windows HX
   client using the VPS IP and assigned port.

The server uses UDP ports 7790–7850 in three-port bundles: gameplay, query,
and uplink. The installer opens the range in UFW. Each party gets a private
room directory, its own Wine prefix and `HX.ini`, and a cap of eight players.
The game assets stay in the VPS private game directory; the server never
offers them for download.

[HX's official hosting instructions](https://wiki.deusexcoop.com/index.php?title=Hosting_a_Server)
document `HCC.exe server 01_NYC_UNATCOIsland`. On this headless VPS,
`wine HCC.exe` binds successfully while `wineconsole` exits without an X server.
