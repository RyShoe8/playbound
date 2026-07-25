/** Shared HTML / Open Graph helpers for admin import + media fetch. */

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function absoluteUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

export interface PageMeta {
  title: string;
  description: string;
  images: string[];
  siteName: string | null;
}

export async function fetchPageMeta(url: string): Promise<PageMeta> {
  const res = await fetch(url, {
    headers: {
      "user-agent": "PlayBoundAdmin/1.0 (+https://playbound-five.vercel.app)",
      accept: "text/html",
    },
    next: { revalidate: 0 },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Could not fetch page (${res.status})`);
  const html = await res.text();
  const finalUrl = res.url || url;

  const ogTitle = metaContent(html, "og:title");
  const twTitle = metaContent(html, "twitter:title");
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const title = (ogTitle || twTitle || titleTag || "").slice(0, 120);

  const ogDesc = metaContent(html, "og:description");
  const twDesc = metaContent(html, "twitter:description");
  const metaDesc = metaContent(html, "description");
  const description = (ogDesc || twDesc || metaDesc || "").slice(0, 8000);

  const images: string[] = [];
  for (const key of ["og:image", "twitter:image", "twitter:image:src"]) {
    const raw = metaContent(html, key);
    if (raw) {
      const abs = absoluteUrl(finalUrl, raw);
      if (!images.includes(abs)) images.push(abs);
    }
  }

  return {
    title,
    description,
    images,
    siteName: metaContent(html, "og:site_name"),
  };
}
