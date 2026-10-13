const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const assets = path.resolve(__dirname, '../../launcher/assets');
  const source = fs.readFileSync(path.join(assets, 'icon.svg'));
  const png = size => sharp(source).resize(size, size).png().toBuffer();
  fs.writeFileSync(path.join(assets, 'icon.png'), await png(1024));
  fs.writeFileSync(path.join(assets, 'tray-icon.png'), await png(64));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await Promise.all(sizes.map(png));
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  fs.writeFileSync(path.join(assets, 'icon.ico'), Buffer.concat([header, ...images]));
  console.log('Generated sky-blue launcher, tray, and multi-resolution Windows icons.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
