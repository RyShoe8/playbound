/** Read-only release guard: canonical URLs, schema, private-page robots and retired preview redirects. */
const assert = require('node:assert/strict');
const origin = new URL(process.argv[2] || 'https://playbound.club').origin;
const pages = ['/', '/discover', '/games/openra', '/games/openra/editions/official', '/mods', '/multiplayer', '/events', '/hosting', '/developer', '/developers', '/launcher', '/controls', '/connect', '/weekly', '/guides', '/blog', '/collections', '/standards', '/about', '/friends', '/library'];
let eventDetailPath;
const privatePages = new Set(['/developer', '/friends', '/library']);
const requiredTypes = { '/discover': ['ItemList', 'BreadcrumbList'], '/games/openra': ['VideoGame', 'Review', 'FAQPage'], '/events': ['CollectionPage', 'BreadcrumbList'], '/launcher': ['SoftwareApplication'], '/weekly': ['CollectionPage', 'ItemList'], '/standards': ['FAQPage'], '/about': ['AboutPage'] };
function attributes(html) {
  return [...html.matchAll(/<(?:meta|link)\b[^>]*>/g)].map(m => Object.fromEntries([...m[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
}
async function check(path) {
  const [page, legacy] = await Promise.all([
    fetch(origin + path, { signal: AbortSignal.timeout(90000) }),
    fetch(origin + '/new' + (path === '/' ? '' : path), { redirect: 'manual', signal: AbortSignal.timeout(90000) }),
  ]);
  assert.equal(page.status, 200, `${path}: page status`);
  assert.equal(legacy.status, 308, `${path}: retired preview must redirect permanently`);
  assert.equal(new URL(legacy.headers.get('location'), origin).href, origin + path, `${path}: redirect destination`);
  assert.equal(page.headers.get('x-robots-tag'), null, `${path}: preview noindex header must be gone`);
  const html = await page.text();
  if (path === "/events") eventDetailPath = html.match(/href="(\/events\/[a-f0-9]{24})"/)?.[1];
  assert.match(html, /<title>[^<]+<\/title>/, `${path}: missing title`);
  const tags = attributes(html);
  const robots = tags.find(t => t.name === 'robots')?.content || '';
  if (privatePages.has(path)) assert.match(robots, /noindex/, `${path}: private page must stay noindex`);
  else {
    assert.doesNotMatch(robots, /noindex/, `${path}: public page blocked`);
    const canonical = tags.find(t => t.rel === 'canonical')?.href;
    assert.ok(canonical, `${path}: missing canonical`);
    assert.equal(new URL(canonical).href, origin + path, `${path}: canonical changed`);
    assert.ok(tags.find(t => t.name === 'description')?.content, `${path}: missing description`);
    assert.ok(tags.find(t => t.property === 'og:title')?.content, `${path}: missing social metadata`);
  }
  const graphs = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const types = graphs.flatMap(s => (s['@graph'] || [s]).flatMap(n => n['@type'] || []));
  for (const type of ['Organization', 'Person', 'WebSite', ...(requiredTypes[path] || [])]) assert.ok(types.includes(type), `${path}: missing ${type} schema`);
  assert.ok(html.includes('data-warm-preview'), `${path}: standard design missing`);
  console.log(`PASS ${path}`);
}
(async () => {
  for (const path of pages) await check(path);
  const llms = await (await fetch(origin + '/llms.txt')).text();
  assert.match(llms, /weekly newsletter/i);
  assert.match(llms, /free games/i);
  assert.ok(!llms.includes('/new/'), 'AI citation links must remain canonical');
  const sitemap = await (await fetch(origin + '/sitemap.xml')).text();
  assert.ok(!sitemap.includes('/new/'), 'Sitemap must not contain retired preview URLs');
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/events\//, 'Individual events must never enter the sitemap');
  assert.doesNotMatch(sitemap, /<loc>[^<]*\/admin(?:\/|<)/, 'Private event creation/admin must stay out of the sitemap');
  if (eventDetailPath) {
    const detail = await fetch(origin + eventDetailPath, { signal: AbortSignal.timeout(90000) });
    assert.equal(detail.status, 200, 'Linked event page must remain shareable');
    const detailTags = attributes(await detail.text());
    assert.match(detailTags.find(t => t.name === 'robots')?.content || '', /noindex/, 'Individual event must stay noindex');
    console.log('PASS individual event noindex');
  }
  console.log('PASS AI discovery and canonical sitemap');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
