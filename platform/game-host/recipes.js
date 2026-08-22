/**
 * How to spawn a dedicated process for each hostable game.
 * Keep slugs in sync with platform/src/lib/gameHost/catalog.ts.
 *
 * Each recipe:
 *   portStart / portEnd — exclusive range for this game
 *   binaries — first existing path wins
 *   args(port, ctx) — argv after the binary
 *   stdin — optional string written after spawn (Mindustry)
 */

import fs from "node:fs";
import path from "node:path";

const GAMES_ROOT = process.env.GAME_HOST_GAMES_DIR || "/opt/playbound-host/games";

function firstExisting(candidates) {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function gameBin(slug, names) {
  const dir = path.join(GAMES_ROOT, slug);
  return [
    path.join(dir, "run-server"),
    ...names.map((n) => path.join(dir, n)),
    ...names.map((n) => `/usr/lib/${slug}/bin/${n}`),
    ...names.map((n) => `/usr/lib/hedgewars/bin/${n}`),
    ...names.map((n) => `/usr/games/${n}`),
    ...names.map((n) => `/usr/bin/${n}`),
    ...names.map((n) => `/usr/local/bin/${n}`),
  ];
}

function openRaMod(editionSlug) {
  const raw = String(editionSlug || "").toLowerCase();
  if (raw.includes("cnc") || raw.includes("tiberian") || raw === "td") return "cnc";
  if (raw.includes("d2k") || raw.includes("dune")) return "d2k";
  return "ra";
}

export const recipes = {
  openra: {
    portStart: 1234,
    portEnd: 1250,
    protocol: "tcp",
    binaries: gameBin("openra", ["OpenRA.Server", "openra-server"]),
    args: (port, ctx) => [
      `Game.Mod=${openRaMod(ctx.editionSlug)}`,
      `Server.Name=${ctx.name}`,
      `Server.ListenPort=${port}`,
      "Server.AdvertiseOnline=False",
      "Server.EnableSingleplayer=False",
    ],
  },
  openttd: {
    portStart: 3979,
    portEnd: 3999,
    protocol: "both",
    binaries: gameBin("openttd", ["openttd"]),
    args: (port) => ["-D", `0.0.0.0:${port}`],
  },
  luanti: {
    portStart: 30000,
    portEnd: 30020,
    protocol: "udp",
    binaries: gameBin("luanti", ["luantiserver", "minetestserver"]),
    args: (port, ctx) => [
      "--port",
      String(port),
      "--worldname",
      `pb-${ctx.partyId.slice(-8)}`,
      "--gameid",
      "minetest",
    ],
  },
  mindustry: {
    portStart: 6567,
    portEnd: 6587,
    protocol: "both",
    binaries: [
      ...gameBin("mindustry", ["run-server"]),
      "/usr/bin/java",
    ],
    args: (port, ctx) => {
      const jar = firstExisting([
        path.join(GAMES_ROOT, "mindustry", "server-release.jar"),
        path.join(GAMES_ROOT, "mindustry", "Mindustry.jar"),
      ]);
      if (jar) return ["-jar", jar];
      return [];
    },
    resolveBinary: (candidates) => {
      const jar = firstExisting([
        path.join(GAMES_ROOT, "mindustry", "server-release.jar"),
        path.join(GAMES_ROOT, "mindustry", "Mindustry.jar"),
      ]);
      const wrapper = firstExisting(gameBin("mindustry", ["run-server"]));
      if (wrapper) return wrapper;
      if (jar && fs.existsSync("/usr/bin/java")) return "/usr/bin/java";
      return firstExisting(candidates);
    },
    stdin: (port, ctx) => `config name ${ctx.name}\nconfig port ${port}\nhost\n`,
  },
  ysoccer: {
    portStart: 54555,
    portEnd: 54575,
    protocol: "both",
    binaries: [
      path.join(GAMES_ROOT, "ysoccer", "ysoccer-server.jar"),
      "/usr/bin/java",
    ],
    resolveBinary: () => {
      const jar = path.join(GAMES_ROOT, "ysoccer", "ysoccer-server.jar");
      if (fs.existsSync(jar) && fs.existsSync("/usr/bin/java")) return "/usr/bin/java";
      return null;
    },
    args: (port) => [
      "-jar",
      path.join(GAMES_ROOT, "ysoccer", "ysoccer-server.jar"),
      String(port),
      String(port),
    ],
  },
  hedgewars: {
    portStart: 46631,
    portEnd: 46650,
    protocol: "both",
    binaries: gameBin("hedgewars", ["hedgewars-server"]),
    args: (port) => ["-p", String(port)],
  },
  "warzone-2100": {
    portStart: 2100,
    portEnd: 2120,
    protocol: "both",
    binaries: gameBin("warzone-2100", ["warzone2100"]),
    args: (port) => ["--dedicated", `--port=${port}`],
  },
  freeciv: {
    portStart: 5556,
    portEnd: 5576,
    protocol: "tcp",
    binaries: gameBin("freeciv", ["freeciv-server"]),
    args: (port) => ["-p", String(port)],
  },
  bzflag: {
    portStart: 5154,
    portEnd: 5174,
    protocol: "both",
    binaries: gameBin("bzflag", ["bzfs"]),
    args: (port) => ["-p", String(port), "-g", "-noTeamKills"],
  },
  supertuxkart: {
    portStart: 2759,
    portEnd: 2779,
    protocol: "both",
    binaries: gameBin("supertuxkart", ["supertuxkart"]),
    args: (port, ctx) => [
      `--lan-server=${ctx.name}`,
      `--port=${port}`,
      "--no-graphics",
    ],
  },
  xonotic: {
    portStart: 26000,
    portEnd: 26020,
    protocol: "udp",
    binaries: gameBin("xonotic", [
      "xonotic-linux64-dedicated",
      "xonotic-dedicated",
    ]),
    args: (port, ctx) => [
      "+port",
      String(port),
      "+hostname",
      ctx.name,
      "+sv_public",
      "0",
    ],
  },
  openarena: {
    portStart: 27960,
    portEnd: 27980,
    protocol: "udp",
    binaries: gameBin("openarena", ["openarena-server"]),
    args: (port, ctx) => [
      "+set",
      "dedicated",
      "1",
      "+set",
      "net_port",
      String(port),
      "+set",
      "sv_hostname",
      ctx.name,
      "+set",
      "sv_master1",
      '""',
    ],
  },
  triplea: {
    portStart: 3303,
    portEnd: 3323,
    protocol: "tcp",
    binaries: [
      ...gameBin("triplea", ["run-server"]),
      "/usr/bin/java",
    ],
    args: (port) => {
      const jar = firstExisting([
        path.join(GAMES_ROOT, "triplea", "triplea.jar"),
      ]);
      if (jar) return ["-jar", jar, "server", `--port=${port}`];
      return [`--port=${port}`];
    },
  },
  "0-ad": {
    portStart: 20595,
    portEnd: 20615,
    protocol: "udp",
    binaries: gameBin("0-ad", ["pyrogenesis", "0ad"]),
    args: (port) => ["-autostart-nonrandom=1", `--port=${port}`],
  },
  mrboom: {
    portStart: 27999,
    portEnd: 28019,
    protocol: "udp",
    binaries: gameBin("mrboom", ["mrboom-server", "mrboom"]),
    args: (port) => ["-p", String(port)],
  },
  "wolfenstein-enemy-territory": {
    portStart: 27950,
    portEnd: 27959,
    protocol: "udp",
    binaries: gameBin("wolfenstein-enemy-territory", [
      "etlded",
      "etlded.x86_64",
      "etl.x86_64.ded",
    ]),
    args: (port, ctx) => [
      "+set",
      "dedicated",
      "2",
      "+set",
      "net_port",
      String(port),
      "+set",
      "sv_hostname",
      ctx.name,
      "+set",
      "sv_master1",
      '""',
      "+set",
      "sv_pure",
      "0",
      "+map",
      "oasis",
    ],
  },
};

export function resolveRecipe(slug) {
  const recipe = recipes[slug];
  if (!recipe) return null;
  const binary = recipe.resolveBinary
    ? recipe.resolveBinary(recipe.binaries)
    : firstExisting(recipe.binaries);
  return { recipe, binary };
}

const HOST_TITLES = {
  "0-ad": "0 A.D.",
  "wolfenstein-enemy-territory": "Wolfenstein: Enemy Territory",
  ysoccer: "YSoccer",
};

/**
 * VPS dedicated binary is missing — not the party leader's local install.
 * health.games lists which recipes resolved a binary on this box.
 */
export function missingDedicatedBinaryMessage(slug, recipe) {
  const title = HOST_TITLES[slug] || slug;
  const names = [
    ...new Set(
      (recipe?.binaries || [])
        .map((p) => path.basename(String(p || "")))
        .filter(Boolean)
    ),
  ];
  const ops = names.length
    ? ` The VPS is missing ${names.join(" or ")} — check health.games.`
    : "";
  return `PlayBound's game server does not have ${title} yet.${ops}`;
}

export function listInstalled() {
  const out = {};
  for (const slug of Object.keys(recipes)) {
    const { binary } = resolveRecipe(slug);
    out[slug] = Boolean(binary);
  }
  return out;
}
