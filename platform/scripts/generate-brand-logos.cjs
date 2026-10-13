// Regenerate high-resolution brand downloads from the outlined vector masters.
// The SVGs preserve the website wordmark, centered tagline and corrected arrow.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
async function main() {
  const root = path.join(__dirname, '../public/brand');
  for (const variant of ['', '-dark', '-light']) {
    for (const [stem, width] of [['playbound-warm', 4800], ['playbound-arrow', 4096]]) {
      const source = path.join(root, `${stem}${variant}.svg`);
      const target = path.join(root, `${stem}${variant}-${width}.png`);
      await sharp(await fs.readFile(source), { density: 600 }).resize({ width }).png().toFile(target);
      console.log(path.basename(target));
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
