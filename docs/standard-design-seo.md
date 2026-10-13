# Standard design SEO release checks

The new design is served at the established site URLs. `/new` and its page descendants permanently redirect (308), preserving query parameters. Canonicals, Open Graph, Twitter metadata, sitemap entries, JSON-LD entity IDs, `/llms.txt`, and `/api/public/` citation endpoints retain those established URLs. Account and administration pages remain private and non-indexable.

Before the cutover, 21 live standard/preview page pairs had matching titles, descriptions, canonical URLs, social metadata, and top-level schema types. The preview's deliberate `X-Robots-Tag: noindex, nofollow` must not reach the standard pages.

After any layout or routing release, run:

```
node scripts/check-site-seo.cjs
```

The read-only smoke check verifies public page metadata, parseable server-rendered JSON-LD, required schema types, private-page noindex, retired preview redirects, AI-discovery copy and sitemap canonical paths. It never creates account, catalog, party, or event records. Run against the production canonical origin; staging hosts intentionally use different canonical and robots policies.

The root layout remains the single owner of Organization, WebSite and editor Person entities. Game pages continue to own their VideoGame, Review, FAQ and breadcrumb graphs. Events now also publishes its visible calendar as Event/CollectionPage schema. Newsletter discovery copy describes new games, free games and PlayBound updates; historical issues retain their existing identities.

These checks protect discoverability and machine-readable attribution. They cannot guarantee rankings or inclusion in AI answers.
