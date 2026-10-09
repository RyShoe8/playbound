import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Every <img> / <Image> must say what the picture is. An empty alt tells
 * assistive technology and image search that the picture is decoration, which
 * is wrong for a cover, a screenshot or an avatar; a missing alt is worse.
 * Name the subject — "${title} cover art", "${title} screenshot 2 of 5".
 */
describe("image alt text", () => {
  it("is present and descriptive on every image tag", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const source = fs.readFileSync(file, "utf8");
      const tags = source.matchAll(/<(img|Image|NextImage)\b([\s\S]*?)\/>/g);
      for (const tag of tags) {
        const attrs = tag[2];
        const alt = attrs.match(/\balt=("[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})/);
        const line = source.slice(0, tag.index).split("\n").length;
        const where = `${path.relative(SRC, file)}:${line}`;
        if (!alt) offenders.push(`${where} has no alt`);
        else if (alt[1] === '""' || alt[1] === "{''}" || alt[1] === '{""}') offenders.push(`${where} has an empty alt`);
        else if (/^"(image|photo|picture|cover|screenshot|img)"$/i.test(alt[1])) offenders.push(`${where} alt is generic: ${alt[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
