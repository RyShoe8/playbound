// Builds the mod review page from raw*.txt. Run: node scripts/mod-review/build.mjs <out.html>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(dir, "mod-review.html");

const GAME = {
  morrowind: ["morrowind", "The Elder Scrolls III: Morrowind"],
  kotor: ["star-wars-knights-of-the-old-republic", "Star Wars: Knights of the Old Republic"],
  kotor2: ["star-wars-knights-of-the-old-republic-ii-the-sith-lords", "Star Wars: Knights of the Old Republic II – The Sith Lords"],
  "stardew-valley": ["stardew-valley", "Stardew Valley"],
  "thief-2-the-metal-age": ["thief-2-the-metal-age", "Thief II: The Metal Age"],
  "thief-gold": ["thief-gold", "Thief Gold"],
  "deus-ex-goty-edition": ["deus-ex-goty-edition", "Deus Ex GOTY Edition"],
  starcraft: ["starcraft", "StarCraft"],
  "quake-ii-enhanced": ["quake-ii-enhanced", "Quake II Enhanced"],
  "counter-strike-source": ["counter-strike-source", "Counter-Strike: Source"],
  "battlefield-1942-anthology": ["battlefield-1942-anthology", "Battlefield 1942 Anthology"],
  "wolfenstein-enemy-territory": ["wolfenstein-enemy-territory", "Wolfenstein: Enemy Territory"],
  "medal-of-honor-allied-assault": ["medal-of-honor-allied-assault", "Medal of Honor: Allied Assault"],
  "heroes-of-might-and-magic-3-complete": ["heroes-of-might-and-magic-3-complete", "Heroes of Might and Magic III Complete"],
  "stronghold-crusader-hd": ["stronghold-crusader-hd", "Stronghold Crusader HD"],
  "team-fortress-2": ["team-fortress-2", "Team Fortress 2"],
  "0ad": ["0ad", "0 A.D."],
  "alien-swarm": ["alien-swarm", "Alien Swarm"],
  "cry-of-fear": ["cry-of-fear", "Cry of Fear"],
  triplea: ["triplea", "TripleA"],
  freedoom: ["freedoom", "Freedoom"],
  openra: ["openra", "OpenRA"],
  "shadow-warrior-classic-complete": ["shadow-warrior-classic-complete", "Shadow Warrior Classic Complete"],
  "warzone-2100": ["warzone-2100", "Warzone 2100"],
  openciv3: ["openciv3", "OpenCiv3"],
  wolfenstein: ["wolfenstein", "Wolfenstein"],
  openarena: ["openarena", "OpenArena"],
  "star-wars-galactic-battlegrounds-saga": ["star-wars-galactic-battlegrounds-saga", "Star Wars: Galactic Battlegrounds Saga"],
  "renegade-x": ["renegade-x", "Renegade X"],
  barotrauma: ["barotrauma", "Barotrauma"],
  "the-ur-quan-masters": ["the-ur-quan-masters", "The Ur-Quan Masters"],
  "ground-control-2-operation-exodus": ["ground-control-2-operation-exodus", "Ground Control II: Operation Exodus"],
  "marathon-2": ["marathon-2", "Marathon 2"],
  "stalker-anomaly": ["stalker-anomaly", "S.T.A.L.K.E.R. Anomaly"],
};
const NEXUS_DOMAIN = { morrowind: "morrowind", kotor: "kotor", kotor2: "kotor2", "stardew-valley": "stardewvalley", "thief-2-the-metal-age": "thief2", "deus-ex-goty-edition": "deusex" };
const ALIAS = { givemedeusexaugmentededition: "gmdxaugmentededition", gmdxaugmentededition: "gmdxaugmentededition" };
const DROP = new Set(["trem", "hotel-carone"]);
const EDITION_IDS = new Set(["ultima-ix-redemption", "48909", "morrowind-stargate", "desert-combat", "battlegroup42", "forgotten-hope", "eve-of-destruction1", "lambda-wars", "the-nameless-mod", "nihilum", "gloom", "paintball-2", "action-quake-ii", "project-vortex", "forgotten-hope-secret-weapon"]);

const norm = (t) => { const k = t.toLowerCase().replace(/[^a-z0-9]/g, ""); return ALIAS[k] || k; };
const games = new Map();
for (const f of ["raw1.txt", "raw2.txt", "raw3.txt", "raw4.txt"]) {
  for (const line of readFileSync(path.join(dir, f), "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const p = line.split("|");
    const src = p[0];
    const gk = p[1];
    if (!GAME[gk]) throw new Error("unknown game " + gk);
    let rec;
    if (src === "M") {
      const [, , slug, title, author, year, rating, pop, upd, tc, ...desc] = p;
      if (DROP.has(slug)) continue;
      const isAddon = slug.startsWith("A:");
      rec = { id: slug, title, author, year, rating, pop: pop.includes("downloads") ? pop : pop + " visits", upd, tc: tc === "TC", desc: desc.join("|"),
        sources: [{ name: "ModDB", url: isAddon ? `https://www.moddb.com/addons/${slug.slice(2)}` : `https://www.moddb.com/mods/${slug}` }] };
    } else {
      const [, , id, title, author, year, end, dl, upd, cat, size, ...desc] = p;
      rec = { id, title, author, year, rating: "", pop: `${Number(end).toLocaleString("en-US")} endorsements · ${Number(dl).toLocaleString("en-US")} downloads`, upd, tc: false, cat, size, desc: desc.join("|"),
        sources: [{ name: "Nexus Mods", url: `https://www.nexusmods.com/${NEXUS_DOMAIN[gk]}/mods/${id}` }] };
    }
    rec.edition = rec.tc || EDITION_IDS.has(rec.id);
    if (!games.has(gk)) games.set(gk, new Map());
    const g = games.get(gk);
    const key = norm(rec.title);
    if (g.has(key)) {
      const e = g.get(key);
      e.sources.push(...rec.sources);
      e.edition = e.edition || rec.edition;
      e.cat = e.cat || rec.cat; e.size = e.size || rec.size;
      if (rec.pop && !e.pop.includes("·")) e.pop += " | " + rec.pop; else e.pop += " | " + rec.pop;
    } else g.set(key, rec);
  }
}

const data = [...games.entries()].map(([k, m]) => ({ slug: GAME[k][0], title: GAME[k][1], mods: [...m.values()] }));
const total = data.reduce((n, g) => n + g.mods.length, 0);
const editions = data.reduce((n, g) => n + g.mods.filter((x) => x.edition).length, 0);
console.log(data.length, "games", total, "mods", editions, "edition candidates");
for (const g of data) if (g.mods.length > 25) console.warn("OVER CAP", g.title, g.mods.length);

const tpl = readFileSync(path.join(dir, "template.html"), "utf8");
writeFileSync(out, tpl.replace("/*DATA*/[]", JSON.stringify(data)).replace("{{TOTAL}}", total).replace("{{GAMES}}", data.length).replace("{{EDITIONS}}", editions));
