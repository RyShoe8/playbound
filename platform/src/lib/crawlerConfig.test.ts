import { describe, expect, it } from "vitest";
import config from "../../next.config";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

describe("crawler delivery", () => {
  it("extends rather than replaces Next's built-in blocking bot coverage", () => {
    const configured = config.htmlLimitedBots!;
    expect(configured.source).toContain(HTML_LIMITED_BOT_UA_RE.source);
    for (const agent of ["Googlebot", "Googlebot-Image", "bingbot", "Twitterbot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"]) {
      expect(configured.test(agent), agent).toBe(true);
    }
    expect(configured.test("Mozilla/5.0 Chrome/130.0")).toBe(false);
  });

  it("serves a static sitemap index and refreshes sitemap sections at the edge within five minutes", async () => {
    const rules = await config.headers!();
    const index = rules.find((rule) => rule.source === "/sitemap.xml");
    expect(index?.headers.map((header) => header.key)).toContain("Vercel-CDN-Cache-Control");
    const section = rules.find((rule) => rule.source === "/sitemaps/:section");
    expect(section?.headers).toContainEqual({
      key: "Vercel-CDN-Cache-Control",
      value: "public, s-maxage=300, stale-while-revalidate=3600",
    });
  });
});
