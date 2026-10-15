import path from "node:path";
import { enrollPairedRuntime, PAIRED_RUNTIMES } from "./pairedRuntimeUpdates.js";
const key = process.argv[2];
if (!Object.hasOwn(PAIRED_RUNTIMES, key || "") || process.argv.length !== 3) throw new Error("A supported paired runtime key is required");
const root = process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games";
console.log(JSON.stringify({ key, ...enrollPairedRuntime(path.join(root, key), key), savedDataMoved: false }));
