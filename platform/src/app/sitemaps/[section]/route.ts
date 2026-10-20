import { buildSitemapSection, isSitemapSection, renderUrlset } from "@/lib/sitemapSections";

export async function GET(_request: Request, context: { params: Promise<{ section: string }> }) {
  const { section: raw } = await context.params;
  const section = raw.replace(/\.xml$/, "");
  if (!isSitemapSection(section)) return new Response("Not found", { status: 404 });
  return new Response(renderUrlset(await buildSitemapSection(section)), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
