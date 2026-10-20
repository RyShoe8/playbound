import { renderSitemapIndex } from "@/lib/sitemapSections";

/** The index is static text, so crawlers get it instantly and fetch the sections in parallel. */
export function GET() {
  return new Response(renderSitemapIndex(), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
