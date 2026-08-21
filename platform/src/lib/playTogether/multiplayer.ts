/**
 * Kept as a re-export so existing party-system imports keep working.
 *
 * This module used to hold its own `isMultiplayerGame` with a different rule
 * from the one in `launcherInstall.ts` — same name, different answers — which
 * is how the party picker came to offer games the join check then refused.
 * `lib/multiplayer/support.ts` is the single definition now.
 */
export { supportsMultiplayer, supportsMultiplayer as isMultiplayerGame } from "@/lib/multiplayer/support";
