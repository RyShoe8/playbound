/**
 * One-time asset preparation. This never writes to MongoDB. It downloads
 * verified matching Steam art, compresses it, and records compare-and-swap
 * replacements for the catalog wave. Run from platform/ with Blob configured.
 */
import nextEnv from "@next/env";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

nextEnv.loadEnvConfig(process.cwd());

const appIds = {
  "baseball-stars-2": 366230,
  "deus-ex-goty-edition": 6910,
  "dungeon-keeper-gold": 1996630,
  factorio: 427520,
  "quake-ii-enhanced": 2320,
  "relic-hunters-zero-remix": 382490,
  rimworld: 294100,
  "rollercoaster-tycoon": 285310,
  "shadow-warrior-classic-complete": 238070,
  "star-wars-knights-of-the-old-republic": 32370,
  "star-wars-knights-of-the-old-republic-ii-the-sith-lords": 208580,
  "stardew-valley": 413150,
  "sudden-strike-2-gold": 612520,
  "thief-gold": 211600,
  "thief-2-the-metal-age": 211740,
};

const custom = {
  "citadel-remonstered": {
    source: "https://www.citadel-universe.com/",
    cover: "https://www.citadel-universe.com/assets/img/background1.jpg",
    screenshots: [],
  },
  "heroes-of-might-and-magic-3-complete": {
    source: "https://www.xbox.com/lt-LT/games/store/heroes-of-might-and-magic-3-complete-edition/9P5241RBH1SZ",
    cover: "https://store-images.s-microsoft.com/image/apps.6737.14074196081223875.50e0d7fc-9a8a-4327-99d3-4874afe93860.0bb8f455-c2a2-4669-8442-adbb2f669ab5",
    screenshotsApp: 297000,
  },
  "medal-of-honor-allied-assault": {
    source: "https://www.ea.com/games/medal-of-honor/medal-of-honor-allied-assault-war-chest",
    cover: "https://cdn.mobygames.com/covers/6787942-medal-of-honor-allied-assault-war-chest-windows-front-cover.jpg",
    screenshots: ["https://media.contentapi.ea.com/content/dam/gin/images/2017/05/moh-aa-screenshot-1.jpg.adapt.crop16x9.1080p.jpg"],
  },
  "soccer-brawl": {
    source: "https://www.snk-corp.co.jp/us/games/acaneogeo/soccerbrawl/",
    cover: "https://www.snk-corp.co.jp/us/games/acaneogeo/soccerbrawl/img/icon.jpg",
    screenshots: [
      "https://image.api.playstation.com/cdn/EP8908/CUSA10297_00/FREE_CONTENT7vlxHEyEnfrOrv7NBwxn/8.png",
      "https://image.api.playstation.com/cdn/EP8908/CUSA10297_00/FREE_CONTENToumQVlMK6xL4uhNoDV9v/7.png",
    ],
  },
  "super-sidekicks": {
    source: "https://www.snk-corp.co.jp/us/games/acaneogeo/s-sidekick/",
    cover: "https://www.snk-corp.co.jp/us/games/acaneogeo/s-sidekick/img/icon.jpg",
    screenshots: [
      "https://image.api.playstation.com/cdn/EP8908/CUSA09121_00/FREE_CONTENTT1rsN66uNr8XYyXjQkQu/SUPERSIDEKICK_02.jpg",
      "https://image.api.playstation.com/cdn/EP8908/CUSA09121_00/FREE_CONTENTLxsfiqZ2B112yKuCvGEN/SUPERSIDEKICK_010.jpg",
    ],
  },
  "theme-hospital": {
    source: "https://www.ea.com/games/theme/theme-hospital",
    cover: "https://drop-assets.ea.com/images/1yJtgD97xroPbYCjwTfiKU/1f4a51417f5d42d878e157dfcbd30354/Theme-Hospital-pack-front-2x1.jpg",
    screenshots: ["https://drop-assets.ea.com/images/mFCN1SV6FF2qDaTp2Onx9/7f61d2b74d857e7ac985ef029a307818/Theme-Hospital-game-art-16x9.jpg"],
  },
  "tomb-raider-123": {
    source: "https://www.tombraider.com/products/games/tomb-raider-1996",
    cover: "https://images.ctfassets.net/x77ixfmkpoiv/wEiuNosPX2ltEijeEz1EQ/f8812961bc176e577e58262442f37ec9/TR1996_1.png",
    screenshotsApps: [224960, 225300, 225320],
  },
};

const target = "src/lib/data/storeMediaRepairAssets.json";
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required");

async function json(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function rehost(url, pathname) {
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  if (!res.headers.get("content-type")?.startsWith("image/")) {
    throw new Error(`${url}: response is not an image`);
  }
  const source = Buffer.from(await res.arrayBuffer());
  const image = await sharp(source, { failOn: "error" })
    .rotate()
    .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const blob = await put(pathname, image, {
    access: "public",
    contentType: "image/webp",
    token,
  });
  return blob.url;
}

let manifest = {};
try { manifest = JSON.parse(await readFile(target, "utf8")); } catch { /* first run */ }
for (const slug of [...Object.keys(appIds), ...Object.keys(custom)]) {
  const appId = appIds[slug];
  const manual = custom[slug];
  const previous = manifest[slug];
  if (previous && (!manual?.screenshots?.length || previous.screenshots?.to?.length)) continue;
  const live = await json(`https://playbound.club/api/launcher/games/${slug}`);
  const needsCover = /gog-statics\.com/i.test(live.coverImage || "");
  const oldScreenshots = Array.isArray(live.screenshots) ? live.screenshots : [];
  const needsScreenshots = oldScreenshots.some((url) => /gog-statics\.com/i.test(url));
  if (!needsCover && !needsScreenshots) {
    console.log(`${slug}: already replaced; skipping`);
    continue;
  }

  let steam;
  if (appId) {
    const response = await json(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`);
    const entry = response[String(appId)];
    if (!entry?.success || !entry.data?.header_image) throw new Error(`${slug}: no Steam art`);
    steam = entry.data;
  }
  const repair = previous || { source: manual?.source || `https://store.steampowered.com/app/${appId}/` };

  if (needsCover && !repair.coverImage) {
    repair.coverImage = {
      from: live.coverImage,
      to: await rehost(manual?.cover || steam.header_image, `games/${slug}/store-media-repair-cover.webp`),
    };
  }

  if (needsScreenshots) {
    let sources = manual?.screenshots || (steam?.screenshots || [])
      .map((shot) => shot.path_full)
      .filter(Boolean)
      .slice(0, 8);
    if (manual?.screenshotsApp || manual?.screenshotsApps) {
      sources = [];
      for (const id of manual.screenshotsApps || [manual.screenshotsApp]) {
        const response = await json(`https://store.steampowered.com/api/appdetails?appids=${id}&l=english`);
        const entry = response[String(id)];
        if (!entry?.success) throw new Error(`${slug}: Steam screenshots for ${id} unavailable`);
        sources.push(...(entry.data.screenshots || []).slice(0, manual.screenshotsApps ? 2 : 8).map((shot) => shot.path_full));
      }
    }
    const uploaded = [];
    for (let index = 0; index < sources.length; index++) {
      uploaded.push(await rehost(
        sources[index],
        `games/${slug}/store-media-repair-shot-${index + 1}.webp`,
      ));
    }
    repair.screenshots = {
      from: oldScreenshots,
      to: [
        ...oldScreenshots.filter((url) => !/gog-statics\.com/i.test(url)),
        ...uploaded,
      ],
    };
  }

  manifest[slug] = repair;
  await writeFile(target, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${slug}: ${needsCover ? "cover" : ""} ${needsScreenshots ? "screenshots" : ""} prepared`);
}

const editionSources = {
  "deus-ex-goty-edition/gmdx": {
    source: "https://www.moddb.com/mods/gmdx",
    cover: "https://media.moddb.com/images/mods/1/23/22166/gmdx.png",
    screenshots: [
      "https://media.moddb.com/images/mods/1/23/22166/DXShantyTown.jpg",
      "https://media.moddb.com/images/members/1/628/627706/profile/GMDX_4.jpg",
    ],
  },
  "quake-ii-enhanced/quake-ii-rtx": {
    source: "https://store.steampowered.com/app/1089130/Quake_II_RTX/",
    steamApp: 1089130,
  },
  "morrowind/tamriel-rebuilt": {
    source: "https://www.tamriel-rebuilt.org/galleries/screenshots",
    cover: "https://f4.bcbits.com/img/a1264472496_10.jpg",
    screenshots: [
      "https://staticdelivery.nexusmods.com/images/100/19250-1535736347.jpg",
      "https://staticdelivery.nexusmods.com/images/100/14784219-1473348763.jpg",
    ],
  },
};

const editionTarget = "src/lib/data/storeEditionMediaRepairAssets.json";
let editionManifest = {};
try { editionManifest = JSON.parse(await readFile(editionTarget, "utf8")); } catch { /* first run */ }
for (const [key, config] of Object.entries(editionSources)) {
  if (editionManifest[key]) continue;
  const [gameSlug, editionSlug] = key.split("/");
  const data = await json(`https://playbound.club/api/games/${gameSlug}/editions`);
  const edition = data.editions?.find((row) => row.slug === editionSlug);
  if (!edition?.branding) throw new Error(`${key}: edition branding unavailable`);
  const branding = edition.branding;
  const needsHero = /gog-statics\.com/i.test(branding.heroImage || "");
  const oldScreenshots = branding.screenshots || [];
  const needsScreenshots = oldScreenshots.some((url) => /gog-statics\.com/i.test(url));
  if (!needsHero && !needsScreenshots) continue;

  let steam;
  if (config.steamApp) {
    const response = await json(`https://store.steampowered.com/api/appdetails?appids=${config.steamApp}&l=english`);
    steam = response[String(config.steamApp)]?.data;
    if (!steam?.header_image) throw new Error(`${key}: Steam media unavailable`);
  }
  const entry = { source: config.source };
  const blobSlug = `${gameSlug}-${editionSlug}`;
  if (needsHero) {
    entry.heroImage = {
      from: branding.heroImage,
      to: await rehost(config.cover || steam.header_image, `editions/${blobSlug}/store-media-repair-hero.webp`),
    };
  }
  if (needsScreenshots) {
    const sources = config.screenshots || (steam.screenshots || []).slice(0, 8).map((shot) => shot.path_full);
    const uploaded = [];
    for (let index = 0; index < sources.length; index++) {
      uploaded.push(await rehost(sources[index], `editions/${blobSlug}/store-media-repair-shot-${index + 1}.webp`));
    }
    entry.screenshots = {
      from: oldScreenshots,
      to: [
        ...oldScreenshots.filter((url) => !/gog-statics\.com/i.test(url)),
        ...uploaded,
      ],
    };
  }
  editionManifest[key] = entry;
  await writeFile(editionTarget, JSON.stringify(editionManifest, null, 2) + "\n");
  console.log(`${key}: edition media prepared`);
}
