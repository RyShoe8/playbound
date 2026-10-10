import { readFileSync, writeFileSync } from "node:fs";
const lines = readFileSync("approved.txt", "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(" | "));
const out = [];
for (const [game, type, title, url] of lines) {
  const q = title.replace(/[:\-–()&]/g, " ").replace(/\s+/g, " ").trim();
  let hits = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=4`, { headers: { "user-agent": "playbound-research", accept: "application/vnd.github+json" } });
    if (r.status === 403 || r.status === 429) { await new Promise((s) => setTimeout(s, 30000)); continue; }
    if (r.ok) hits = (await r.json()).items.map((i) => `${i.full_name}|${i.stargazers_count}★|${(i.description || "").slice(0, 70)}|pushed ${i.pushed_at.slice(0, 7)}`);
    break;
  }
  out.push({ game, type, title, url, hits });
  writeFileSync("ghsearch.json", JSON.stringify(out, null, 1));
  await new Promise((s) => setTimeout(s, 7000));
}
console.log("done", out.length);
