// One outlined master supplies the site, launcher, email, and social downloads.
// Usage: node scripts/generate-brand-logos.cjs [--export-dir D:/Playbound/Files/Logos/PlayBound-Arcade]
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const brand = require('../branding/arcade-master.json');
const { blue, navy, white } = brand.colors;
const root = path.resolve(__dirname, '../public/brand');
const launcher = path.resolve(__dirname, '../../launcher/assets');
const iconDir = path.resolve(__dirname, '../src/app');
const exportIndex = process.argv.indexOf('--export-dir');
const exportDir = exportIndex < 0 ? null : path.resolve(process.argv[exportIndex + 1]);
const files = [];

const svg = (w, h, body, title = 'PlayBound — Discover. Play. Connect.') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill-rule="evenodd"><title>${title}</title>${body}</svg>`;
const rect = (w, h, fill) => `<path fill="${fill}" d="M0 0H${w}V${h}H0Z"/>`;
const p = (d, fill) => `<path fill="${fill}" d="${d}"/>`;
const cabinet = (ink, screen = blue) => p(brand.cabinet.body, ink) + (screen ? p(brand.cabinet.screen, screen) : '');
const letters = (ink) => p(brand.wordmark.body, ink) + p(brand.wordmark.accent, blue);
const group = (x, y, scale, body) => `<g transform="translate(${x} ${y}) scale(${scale})">${body}</g>`;
function lockup(ink = white, background = null, compact = false) {
  const w = compact ? 1500 : 1540, h = compact ? 340 : 480;
  const art = compact
    ? group(10, 7, .77, cabinet(ink)) + group(300, 45, 1, letters(ink))
    : group(20, 20, 1, cabinet(ink)) + group(345, 70, 1, letters(ink)) + group(445, 330, 1, p(brand.tagline.body, ink));
  return svg(w, h, (background ? rect(w, h, background) : '') + art);
}
// At 16–48 px the screen and silhouette matter more than hairline cabinet seams.
const microPath = 'M14 54L16 23Q16 18 20 15L30 7Q32 5 35 6L51 9Q54 10 54 13V20Q54 22 51 24L47 27L49 38L55 43L52 55Q52 57 49 58L36 61L17 56Q14 56 14 54ZM32 11L31 18L50 20V13ZM27 26L29 37L44 35L42 25ZM24 20L21 25L24 41L32 47L30 57L33 58L35 47L52 44L51 41L34 44L27 39L24 25L28 21Z';
function icon(micro = false) {
  return micro
    ? svg(64, 64, rect(64, 64, blue) + p(microPath, white), 'PlayBound arcade cabinet')
    : svg(1024, 1024, rect(1024, 1024, blue) + group(239, 148, 1.73, cabinet(white, null)), 'PlayBound arcade cabinet');
}
async function write(name, data) { await fs.writeFile(path.join(root, name), data); }
async function png(source, width, target) {
  await sharp(Buffer.from(source), { density: 96 }).resize({ width }).png().toFile(target);
}
async function deliver(name, source, width) {
  if (!exportDir) return;
  const dest = path.join(exportDir, name);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (width) await png(source, width, dest); else await fs.writeFile(dest, source);
  files.push(name);
}
function banner(w, h, logoWidth, y = null) {
  const height = logoWidth * 480 / 1540;
  const content = lockup(white).replace(/^<svg[^>]+>/, '').replace(/<title>.*?<\/title>/, '').replace(/<\/svg>$/, '');
  return svg(w, h, rect(w, h, navy) + group((w-logoWidth)/2, y ?? (h-height)/2, logoWidth/1540, content));
}
async function main() {
  await fs.mkdir(root, { recursive: true });
  for (const [name, ink, bg] of [['on-dark', white, null], ['on-light', navy, null], ['dark', white, navy], ['light', navy, white]]) {
    const source = lockup(ink, bg);
    await write(`playbound-arcade-${name}.svg`, source);
    await png(source, 1200, path.join(root, `playbound-arcade-${name}-1200.png`));
    await deliver(`Masters/playbound-arcade-${name}.svg`, source);
    await deliver(`Masters/playbound-arcade-${name}-6000.png`, source, 6000);
  }
  for (const [name, ink] of [['on-dark', white], ['on-light', navy]]) {
    const source = lockup(ink, null, true);
    await write(`playbound-arcade-compact-${name}.svg`, source);
    await fs.writeFile(path.join(launcher, `logo-${name}.svg`), source);
    await deliver(`Masters/playbound-arcade-compact-${name}.svg`, source);
  }
  const avatar = icon();
  await write('playbound-arcade-avatar.svg', avatar);
  await png(avatar, 1024, path.join(root, 'playbound-arcade-avatar-1024.png'));
  await fs.writeFile(path.join(launcher, 'icon.svg'), avatar);
  await fs.writeFile(path.join(launcher, 'icon-small.svg'), icon(true));
  await fs.writeFile(path.join(iconDir, 'icon.svg'), icon(true));
  await png(avatar, 180, path.join(iconDir, 'apple-icon.png'));
  await deliver('Masters/playbound-arcade-avatar.svg', avatar);
  await deliver('Masters/playbound-arcade-avatar-4096.png', avatar, 4096);
  for (const [name, ink] of [['white', white], ['navy', navy], ['blue', blue]]) {
    const source = svg(356, 462, group(20, 20, 1, cabinet(ink, null)), 'PlayBound arcade cabinet');
    await write(`playbound-arcade-symbol-${name}.svg`, source);
    await deliver(`Masters/playbound-arcade-symbol-${name}.svg`, source);
    await deliver(`Masters/playbound-arcade-symbol-${name}-4096.png`, source, 4096);
  }
  // Preserve old download URLs, but never serve the retired arrow from them.
  for (const [suffix, ink, bg] of [['', white, null], ['-dark', white, navy], ['-light', navy, white]]) {
    const logo = lockup(ink, bg);
    await write(`playbound-warm${suffix}.svg`, logo);
    await png(logo, 4800, path.join(root, `playbound-warm${suffix}-4800.png`));
    const mark = svg(1024, 1024, (bg ? rect(1024,1024,bg) : '') + group(239,148,1.73,cabinet(ink, null)), 'PlayBound arcade cabinet');
    await write(`playbound-arrow${suffix}.svg`, mark);
    await png(mark, 4096, path.join(root, `playbound-arrow${suffix}-4096.png`));
  }
  for (const name of ['playbound-logo-120.png', 'playbound-logo-120-onwhite.png']) await png(avatar, 120, path.join(root, name));
  for (const channel of ['Facebook', 'Bluesky', 'Reddit', 'Discord']) await deliver(`${channel}/profile-1024.png`, avatar, 1024);
  await deliver('Discord/server-icon-512.png', avatar, 512);
  await deliver('Facebook/page-cover-1702x630.png', banner(1702, 630, 900, 100), 1702);
  await deliver('Bluesky/banner-3000x1000.png', banner(3000, 1000, 2100, 140), 3000);
  await deliver('Reddit/community-banner-desktop-2144x256.png', banner(2144, 256, 650), 2144);
  await deliver('Reddit/community-banner-mobile-2160x256.png', banner(2160, 256, 650), 2160);
  await deliver('Reddit/legacy-large-banner-3840x768.png', banner(3840, 768, 1700), 3840);
  for (const [name, w, h, lw] of [['landscape-2400x1260',2400,1260,1900],['square-2160',2160,2160,1780],['portrait-2160x2700',2160,2700,1780],['story-2160x3840',2160,3840,1780]]) {
    await deliver(`Social-posts/${name}.png`, banner(w,h,lw), w);
  }
  // Extras do not imply PlayBound has accounts on these channels.
  await deliver('Additional-channels/instagram-tiktok-profile-1024.png', avatar, 1024);
  await deliver('Additional-channels/youtube-profile-1024.png', avatar, 1024);
  await deliver('Additional-channels/youtube-banner-2560x1440.png', banner(2560,1440,1300), 2560);
  await deliver('Additional-channels/x-banner-1500x500.png', banner(1500,500,1000,65), 1500);
  if (exportDir) {
    await fs.writeFile(path.join(exportDir, 'FILES.txt'), files.join('\n') + '\n');
    console.log(`Exported ${files.length} files to ${exportDir}`);
  }
  console.log('Generated website, launcher and email branding from arcade-master.json.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
