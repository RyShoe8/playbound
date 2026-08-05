/**
 * Best-effort download + crop of mod cover arts into public/mods/{slug}/cover.webp.
 *
 * Usage: npm run fetch:mod-covers
 * Skips slugs that already have cover.webp. Rate-limits GitHub OG fetches.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { compressImageBuffer } from "../src/lib/compressImage";

const ROOT = path.join(process.cwd(), "public", "mods");
const UA =
  "Mozilla/5.0 (compatible; PlayBoundCoverBot/1.1; +https://playbound.club; mod catalog covers)";

type Source =
  | { kind: "url"; url: string }
  | { kind: "contentdb"; author: string; name: string }
  | { kind: "github-og"; repo: string }
  | { kind: "moddb-slug"; slug: string };

const SOURCES: Record<string, Source> = {
  // OpenRA
  "openra-tiberian-dawn-hd": { kind: "github-og", repo: "OpenRA/TiberianDawnHD" },
  "openra-opene2140": { kind: "github-og", repo: "OpenE2140/OpenE2140" },
  "openra-ra-plus": { kind: "github-og", repo: "MlemandPurrs/raplusmod" },
  "openra-combined-arms": {
    kind: "url",
    url: "https://raw.githubusercontent.com/Inq8/CAmod/master/mods/ca/uibits/ca-menu-logo-3x.png",
  },
  "openra-shattered-paradise": { kind: "moddb-slug", slug: "shattered-paradise" },
  "openra-resource-center": {
    kind: "url",
    url: "https://avatars.githubusercontent.com/u/1653221?s=400&v=4", // OpenRA org
  },

  // 0 A.D.
  "0ad-millenium-ad": { kind: "github-og", repo: "0ADMods/millenniumad" },
  "0ad-delenda-est": { kind: "github-og", repo: "0ADMods/delenda_est" },
  "0ad-hyrule-conquest": { kind: "github-og", repo: "Perzival123/Hyrule-Conquest-Revival" },
  "0ad-terra-magna": { kind: "github-og", repo: "0ADMods/terra_magna" },
  "0ad-handbook": {
    kind: "url",
    url: "https://play0ad.com/favicon.ico",
  },

  // Mindustry
  "mindustry-progmats": { kind: "github-og", repo: "MEEPofFaith/prog-mats-java" },
  "mindustry-unlimited-armament": {
    kind: "github-og",
    repo: "Eschatologue/Unlimited-Armament-Works",
  },
  "mindustry-advance-content": { kind: "github-og", repo: "EyeOfDarkness/AdvanceContent" },
  "mindustry-exogenesis": { kind: "github-og", repo: "AureusStratus/ExoGenesis" },
  "mindustry-mod-browser": {
    kind: "url",
    url: "https://cdn.jsdelivr.net/gh/Anuken/Mindustry@master/core/assets-raw/sprites/ui/logo.png",
  },
  "mindustry-multiplayer-maps": {
    kind: "url",
    url: "https://cdn.jsdelivr.net/gh/Anuken/Mindustry@master/core/assets/icons/icon_64.png",
  },

  // OpenTTD
  "openttd-bananas": {
    kind: "url",
    url: "https://cdn.jsdelivr.net/gh/OpenTTD/OpenTTD@master/media/openttd.64.png",
  },
  "openttd-opengfx": { kind: "github-og", repo: "OpenTTD/OpenGFX" },

  // Endless Sky
  "endless-sky-omnis": { kind: "github-og", repo: "EndlessSkyCommunity/-Omnis" },
  "endless-sky-plugins-guide": { kind: "github-og", repo: "endless-sky/endless-sky" },
  "endless-sky-all-plugins": { kind: "github-og", repo: "endless-sky/endless-sky" },
  "endless-sky-community": { kind: "github-og", repo: "EndlessSkyCommunity/.github" },
  "endless-sky-high-sprites": { kind: "github-og", repo: "endless-sky/endless-sky" },
  "endless-sky-corruption": { kind: "github-og", repo: "endless-sky/endless-sky" },

  // Luanti / ContentDB
  "luanti-contentdb": {
    kind: "url",
    url: "https://avatars.githubusercontent.com/u/1204724?s=400&v=4", // luanti-org
  },
  "luanti-mesecons": { kind: "contentdb", author: "Jeija", name: "mesecons" },
  "luanti-technic": { kind: "contentdb", author: "RealBadAngel", name: "technic" },
  "luanti-mineclone": { kind: "contentdb", author: "Wuzzy", name: "mineclone2" },
  "luanti-animalia": { kind: "contentdb", author: "ElCeejo", name: "animalia" },
  "luanti-i3": { kind: "contentdb", author: "mt-mods", name: "i3" },
  "luanti-pipeworks": { kind: "contentdb", author: "mt-mods", name: "pipeworks" },

  // Naev
  "naev-total-conversions": { kind: "url", url: "https://naev.org/imgs/naev.png" },
  "naev-assets-wiki": { kind: "github-og", repo: "naev/naev" },
  "naev-community-ships": { kind: "github-og", repo: "naev/naev" },
  "naev-missions-pack": { kind: "github-og", repo: "naev/naev" },
  "naev-graphics-packs": { kind: "url", url: "https://naev.org/imgs/naev.png" },
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "image/*,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) throw new Error(`Got HTML instead of image: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function resolveUrl(source: Source): Promise<string> {
  if (source.kind === "url") return source.url;
  if (source.kind === "github-og") {
    // Unique prefix avoids shared CDN 429 bursts across identical opengraph paths.
    const salt = `pb${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return `https://opengraph.githubassets.com/${salt}/${source.repo}`;
  }
  if (source.kind === "contentdb") {
    const api = `https://content.luanti.org/api/packages/${encodeURIComponent(source.author)}/${encodeURIComponent(source.name)}/`;
    const res = await fetch(api, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`ContentDB ${res.status} ${source.author}/${source.name}`);
    const data = (await res.json()) as {
      thumbnail?: string;
      screenshots?: { url?: string; is_cover_image?: boolean }[];
    };
    if (data.thumbnail) {
      return data.thumbnail.replace(/\/thumbnails\/\d+\//, "/thumbnails/3/");
    }
    const cover = data.screenshots?.find((s) => s.is_cover_image)?.url;
    if (cover) return cover;
    const first = data.screenshots?.[0]?.url;
    if (first) return first;
    throw new Error(`No ContentDB thumbnail for ${source.author}/${source.name}`);
  }
  if (source.kind === "moddb-slug") {
    const page = `https://www.moddb.com/mods/${source.slug}`;
    const res = await fetch(page, {
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!res.ok) throw new Error(`ModDB ${res.status} ${source.slug}`);
    const html = await res.text();
    const og =
      html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
    if (og?.[1]) return og[1].replace(/&amp;/g, "&");
    const img = html.match(
      /https:\/\/media\.moddb\.com\/[^"'\\\s]+\.(?:jpg|jpeg|png|webp)/i
    );
    if (img?.[0]) return img[0];
    throw new Error(`No ModDB image for ${source.slug}`);
  }
  throw new Error("Unknown source kind");
}

async function writeCover(slug: string, buf: Buffer): Promise<void> {
  const dir = path.join(ROOT, slug);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "cover.webp");

  const meta = await sharp(buf, { failOn: "none", density: 300 }).metadata();
  const isLikelyLogo =
    meta.format === "svg" ||
    String(meta.format) === "ico" ||
    (meta.width != null &&
      meta.height != null &&
      meta.width <= 640 &&
      meta.height <= 640);

  let intermediate: Buffer;
  if (isLikelyLogo) {
    const size = 900;
    const resized = await sharp(buf, { failOn: "none", density: 300 })
      .resize(Math.round(size * 0.72), Math.round(size * 0.72), {
        fit: "inside",
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();
    intermediate = await sharp({
      create: {
        width: size,
        height: 1200,
        channels: 3,
        background: { r: 18, g: 18, b: 28 },
      },
    })
      .composite([{ input: resized, gravity: "centre" }])
      .png()
      .toBuffer();
  } else {
    intermediate = await sharp(buf, { failOn: "none" })
      .resize(900, 1200, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
  }

  const { buffer } = await compressImageBuffer(intermediate);
  fs.writeFileSync(dest, buffer);
}

async function main() {
  const ok: string[] = [];
  const fail: { slug: string; err: string }[] = [];
  const skipped: string[] = [];

  for (const [slug, source] of Object.entries(SOURCES)) {
    const dest = path.join(ROOT, slug, "cover.webp");
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      skipped.push(slug);
      ok.push(slug);
      console.log(`skip ${slug} (exists)`);
      continue;
    }
    try {
      if (source.kind === "github-og") await sleep(1200);
      let buf: Buffer | null = null;
      let url = await resolveUrl(source);
      console.log(`→ ${slug}\n  ${url}`);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          buf = await fetchBuffer(url);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes("429") || attempt === 2) throw err;
          await sleep(2500 * (attempt + 1));
          if (source.kind === "github-og") {
            url = await resolveUrl(source);
            console.log(`  retry ${url}`);
          }
        }
      }
      if (!buf) throw new Error("empty buffer");
      await writeCover(slug, buf);
      ok.push(slug);
      console.log(`  OK`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      fail.push({ slug, err: msg });
      console.warn(`  FAIL ${msg}`);
    }
  }

  console.log(`\nSucceeded: ${ok.length} (skipped existing: ${skipped.length})`);
  console.log(ok.map((s) => `  ${s}`).join("\n"));
  if (fail.length) {
    console.log(`\nFailed: ${fail.length}`);
    for (const f of fail) console.log(`  ${f.slug}: ${f.err}`);
  }

  fs.writeFileSync(
    path.join(process.cwd(), "scripts", ".mod-covers-ok.json"),
    JSON.stringify([...new Set(ok)].sort(), null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
