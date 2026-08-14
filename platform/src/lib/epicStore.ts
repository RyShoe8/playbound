import { normalizeVideoUrl } from "@/lib/mediaEmbed";
import { stripHtml } from "@/lib/pageMeta";

const MAX_SCREENSHOTS = 20;
const MAX_VIDEOS = 10;

const EPIC_PRODUCT_API =
  "https://store-content-ipv4.ak.epicgames.com/api/en-US/content/products";

export type EpicProductPage = {
  type?: string;
  productName?: string;
  _slug?: string;
  _title?: string;
  data?: Record<string, unknown>;
};

export type EpicProduct = {
  productName?: string;
  _slug?: string;
  _title?: string;
  pages?: EpicProductPage[];
};

export type EpicProductExtract = {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  developers: string[];
  publishers: string[];
  platforms: string[];
  tags: string[];
  releaseYear: number;
  storeUrl: string;
  homepageUrl: string | null;
  discordInviteUrl: string | null;
  coverImage: string | null;
  screenshots: string[];
  videos: string[];
  systemRequirements: { min: string; recommended: string };
};

/** Extract product slug from an Epic Games Store product URL. */
export function parseEpicProductSlug(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (!/epicgames\.com$/i.test(u.hostname) && !/\.epicgames\.com$/i.test(u.hostname)) {
      return null;
    }
    // /p/{slug} or /{locale}/p/{slug}
    const m = u.pathname.match(/(?:^|\/)p\/([^/?#]+)/i);
    if (!m?.[1]) return null;
    return decodeURIComponent(m[1]).trim() || null;
  } catch {
    return null;
  }
}

export function epicStoreProductUrl(slug: string): string {
  return `https://store.epicgames.com/p/${encodeURIComponent(slug)}`;
}

export async function fetchEpicProduct(slug: string): Promise<EpicProduct> {
  const res = await fetch(`${EPIC_PRODUCT_API}/${encodeURIComponent(slug)}`, {
    headers: { "user-agent": "PlayBoundAdmin/1.0" },
    next: { revalidate: 0 },
  });
  if (res.status === 404) throw new Error("Epic product not found");
  if (!res.ok) throw new Error(`Epic store-content request failed (${res.status})`);
  return (await res.json()) as EpicProduct;
}

/** Strip a trailing offer id like `-05ff58` if the full /p/ slug 404s. */
export function slugWithoutOfferSuffix(slug: string): string | null {
  const m = slug.match(/^(.*)-[0-9a-f]{4,8}$/i);
  if (!m?.[1] || m[1] === slug) return null;
  return m[1];
}

export async function fetchEpicProductWithFallback(slug: string): Promise<EpicProduct> {
  try {
    return await fetchEpicProduct(slug);
  } catch (err) {
    const alt = slugWithoutOfferSuffix(slug);
    if (!alt) throw err;
    const message = err instanceof Error ? err.message : String(err);
    if (!/not found/i.test(message) && !/\(404\)/.test(message)) throw err;
    return await fetchEpicProduct(alt);
  }
}

export type EpicCatalogSnippet = {
  title: string;
  description: string;
  imageUrl: string;
};

function normalizeEpicPageSlug(value: string): string {
  return value.trim().replace(/\/home$/i, "").toLowerCase();
}

function epicPageSlugEquals(candidate: unknown, slug: string): boolean {
  if (typeof candidate !== "string" || !candidate.trim()) return false;
  return normalizeEpicPageSlug(candidate) === normalizeEpicPageSlug(slug);
}

function pickEpicCatalogImage(keyImages: unknown): string {
  if (!Array.isArray(keyImages)) return "";
  const typed = keyImages.filter(
    (img): img is { type?: string; url?: string } =>
      Boolean(img) && typeof img === "object"
  );
  const order = ["OfferImageWide", "DieselStoreFrontWide", "Thumbnail", "OfferImageTall"];
  for (const type of order) {
    const hit = typed.find((img) => img.type === type && typeof img.url === "string" && img.url);
    if (hit?.url) return hit.url;
  }
  const any = typed.find((img) => typeof img.url === "string" && img.url);
  return any?.url ?? "";
}

function catalogElementMatchesSlug(el: Record<string, unknown>, slug: string): boolean {
  if (epicPageSlugEquals(el.productSlug, slug) || epicPageSlugEquals(el.urlSlug, slug)) return true;
  const mappings = [
    ...(((el.catalogNs as { mappings?: { pageSlug?: string }[] } | undefined)?.mappings) ?? []),
    ...(((el.offerMappings as { pageSlug?: string }[] | undefined) ?? [])),
  ];
  return mappings.some((m) => epicPageSlugEquals(m.pageSlug, slug));
}

function snippetFromCatalogElement(el: Record<string, unknown>): EpicCatalogSnippet | null {
  const title = typeof el.title === "string" ? el.title.trim() : "";
  if (!title) return null;
  const description = typeof el.description === "string" ? el.description.trim() : "";
  return {
    title,
    description,
    imageUrl: pickEpicCatalogImage(el.keyImages),
  };
}

function allEpicCatalogImages(keyImages: unknown): string[] {
  if (!Array.isArray(keyImages)) return [];
  const urls: string[] = [];
  for (const img of keyImages) {
    if (!img || typeof img !== "object") continue;
    const url = (img as { url?: string }).url;
    if (typeof url === "string" && url.trim() && !urls.includes(url.trim())) {
      urls.push(url.trim());
    }
  }
  return urls;
}

function pageSlugFromCatalogElement(el: Record<string, unknown>): string | null {
  const mappings = [
    ...(((el.catalogNs as { mappings?: { pageSlug?: string; pageType?: string }[] } | undefined)?.mappings) ?? []),
    ...(((el.offerMappings as { pageSlug?: string; pageType?: string }[] | undefined) ?? [])),
  ];
  const home = mappings.find((m) => m.pageType === "productHome" && m.pageSlug);
  const any = mappings.find((m) => m.pageSlug);
  const slug = home?.pageSlug || any?.pageSlug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : null;
}

function mediaFromPromotionsElement(el: Record<string, unknown>): {
  coverImage: string | null;
  screenshots: string[];
  videos: string[];
} {
  const urls = allEpicCatalogImages(el.keyImages);
  const cover = pickEpicCatalogImage(el.keyImages) || urls[0] || null;
  const screenshots = urls.filter((u) => u !== cover);
  return {
    coverImage: cover,
    screenshots: screenshots.length ? screenshots : urls.slice(cover ? 1 : 0),
    videos: [],
  };
}

async function fetchFreeGamePromotionElements(): Promise<Record<string, unknown>[]> {
  const res = await fetch(
    "https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US",
    { headers: { "user-agent": "PlayBoundAdmin/1.0" }, next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Epic free-games catalog request failed (${res.status})`);
  const json = (await res.json()) as {
    data?: { Catalog?: { searchStore?: { elements?: Record<string, unknown>[] } } };
  };
  return json.data?.Catalog?.searchStore?.elements ?? [];
}

/**
 * SPT /p/ slugs often 404 on store-content. The free-games catalog JSON is public
 * and includes pageSlug mappings (e.g. caravan-sandwitch-05ff58).
 */
export async function fetchEpicFreeGameByPageSlug(slug: string): Promise<EpicCatalogSnippet | null> {
  const candidates = [slug, slugWithoutOfferSuffix(slug)].filter(
    (s, i, arr): s is string => Boolean(s) && arr.indexOf(s) === i
  );
  const elements = await fetchFreeGamePromotionElements();
  for (const want of candidates) {
    const hit = elements.find((el) => catalogElementMatchesSlug(el, want));
    if (hit) return snippetFromCatalogElement(hit);
  }
  return null;
}

function titlesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Cover, screenshots, and trailers for newsletter media pack (catalog API, then free-games JSON). */
export async function lookupEpicNewsletterMedia(opts: {
  storeUrl?: string;
  title?: string;
}): Promise<{ coverImage: string | null; screenshots: string[]; videos: string[] } | null> {
  const slug = opts.storeUrl ? parseEpicProductSlug(opts.storeUrl) : null;
  if (slug) {
    try {
      return await fetchEpicStoreMedia(slug);
    } catch {
      /* SPT titles 404 on store-content; fall through to promotions */
    }
  }

  const elements = await fetchFreeGamePromotionElements();
  const hit = elements.find((el) => {
    if (slug && catalogElementMatchesSlug(el, slug)) return true;
    const title = typeof el.title === "string" ? el.title : "";
    return Boolean(opts.title?.trim() && titlesMatch(title, opts.title));
  });
  if (!hit) return null;

  const pageSlug = pageSlugFromCatalogElement(hit);
  if (pageSlug) {
    try {
      return await fetchEpicStoreMedia(pageSlug);
    } catch {
      /* use promotions images */
    }
  }
  return mediaFromPromotionsElement(hit);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).map((s) => s.trim()).filter(Boolean);
}

function pickProductPage(product: EpicProduct): EpicProductPage | null {
  const pages = product.pages ?? [];
  const home = pages.find((p) => p.type === "productHome");
  if (home?.data) return home;
  const withAbout = pages.find((p) => {
    const about = p.data?.about as Record<string, unknown> | undefined;
    return Boolean(about && (about.description || about.shortDescription || about.desc));
  });
  return withAbout ?? pages[0] ?? null;
}

/** Epic meta tags are SCREAMING_SNAKE — normalize for genre/feature maps. */
export function humanizeEpicTag(tag: string): string {
  return tag
    .trim()
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function mapEpicPlatform(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (key === "windows" || key === "win32" || key === "win64") return "Windows";
  if (key === "mac" || key === "macos" || key === "osx") return "macOS";
  if (key === "linux") return "Linux";
  if (key === "android") return "Android";
  if (key === "ios") return "iOS";
  if (key === "web" || key === "browser") return "Web";
  return null;
}

function pushUnique(out: string[], url: string | null | undefined) {
  if (!url) return;
  if (out.includes(url)) return;
  out.push(url);
}

function videoUrlsFromRecipes(recipesRaw: unknown): string[] {
  if (typeof recipesRaw !== "string" || !recipesRaw.trim()) return [];
  try {
    const parsed = JSON.parse(recipesRaw) as { output?: unknown };
    if (!Array.isArray(parsed.output)) return [];
    const urls = parsed.output.map(String).filter(Boolean);
    const mp4 = urls.filter((u) => /\.mp4(\?|$)/i.test(u));
    const m3u8 = urls.filter((u) => /\.m3u8(\?|$)/i.test(u));
    const rest = urls.filter((u) => !mp4.includes(u) && !m3u8.includes(u));
    return [...mp4, ...m3u8, ...rest];
  } catch {
    return [];
  }
}

function collectCarouselMedia(data: Record<string, unknown>): {
  images: string[];
  videos: string[];
} {
  const images: string[] = [];
  const videos: string[] = [];
  const carousel = data.carousel as { items?: unknown[] } | undefined;
  const items = Array.isArray(carousel?.items) ? carousel!.items! : [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as {
      image?: { src?: string };
      video?: { recipes?: unknown; poster?: string };
    };
    if (item.image?.src) pushUnique(images, item.image.src);
    for (const candidate of videoUrlsFromRecipes(item.video?.recipes)) {
      const normalized = normalizeVideoUrl(candidate);
      pushUnique(videos, normalized);
    }
  }

  const hero = data.hero as { portrait?: { src?: string }; landscape?: { src?: string } } | undefined;
  if (hero?.landscape?.src) pushUnique(images, hero.landscape.src);
  if (hero?.portrait?.src) pushUnique(images, hero.portrait.src);

  return { images, videos };
}

function formatSystemRequirements(data: Record<string, unknown>): {
  min: string;
  recommended: string;
} {
  const requirements = data.requirements as
    | { systems?: { systemType?: string; details?: { title?: string; minimum?: string; recommended?: string }[] }[] }
    | undefined;
  const systems = Array.isArray(requirements?.systems) ? requirements!.systems! : [];
  const windows =
    systems.find((s) => /^windows$/i.test(s.systemType || "")) ||
    systems.find((s) => /windows/i.test(s.systemType || "")) ||
    systems[0];
  if (!windows?.details?.length) {
    return { min: "See Epic Games Store", recommended: "See Epic Games Store" };
  }

  const minParts: string[] = [];
  const recParts: string[] = [];
  for (const detail of windows.details) {
    const title = (detail.title || "").trim();
    const minimum = (detail.minimum || "").trim();
    const recommended = (detail.recommended || "").trim();
    if (minimum) minParts.push(title ? `${title}: ${minimum}` : minimum);
    if (recommended) recParts.push(title ? `${title}: ${recommended}` : recommended);
  }

  return {
    min: (minParts.join("\n") || "See Epic Games Store").slice(0, 500),
    recommended: (recParts.join("\n") || minParts.join("\n") || "See Epic Games Store").slice(0, 500),
  };
}

export function extractEpicProduct(product: EpicProduct, slug: string): EpicProductExtract {
  const page = pickProductPage(product);
  const data = (page?.data ?? {}) as Record<string, unknown>;
  const about = (data.about ?? {}) as Record<string, unknown>;
  const meta = (data.meta ?? {}) as Record<string, unknown>;
  const social = (data.socialLinks ?? {}) as Record<string, unknown>;

  const title =
    String(product.productName || page?.productName || about.title || product._title || slug).trim() ||
    slug;
  const shortDescription = stripHtml(String(about.shortDescription || "")).slice(0, 500);
  const longRaw = String(about.description || about.desc || "");
  const description = stripHtml(longRaw).slice(0, 8000) || shortDescription;

  const developers = asStringArray(meta.developer);
  const publishers = asStringArray(meta.publisher);
  const platforms = [
    ...new Set(
      asStringArray(meta.platform)
        .map(mapEpicPlatform)
        .filter((p): p is string => Boolean(p))
    ),
  ];
  if (platforms.length === 0) platforms.push("Windows");

  const tags = asStringArray(meta.tags).map(humanizeEpicTag).filter(Boolean);

  let releaseYear = new Date().getFullYear();
  const releaseDate = meta.releaseDate;
  if (typeof releaseDate === "string") {
    const m = releaseDate.match(/\b(19|20)\d{2}\b/);
    if (m) releaseYear = parseInt(m[0], 10);
  }

  const homepageRaw = typeof social.linkHomepage === "string" ? social.linkHomepage.trim() : "";
  const homepageUrl =
    homepageRaw && /^https?:\/\//i.test(homepageRaw) ? homepageRaw : null;
  const discordRaw = typeof social.linkDiscord === "string" ? social.linkDiscord.trim() : "";
  const discordInviteUrl =
    discordRaw && /^https?:\/\//i.test(discordRaw) ? discordRaw : null;

  const { images, videos } = collectCarouselMedia(data);
  const coverImage = images[0] ?? null;
  // Prefer screenshots after the first (cover) when there are multiples.
  const screenshots = (images.length > 1 ? images.slice(1) : images).slice(0, MAX_SCREENSHOTS);

  return {
    slug,
    title,
    shortDescription,
    description,
    developers,
    publishers,
    platforms,
    tags,
    releaseYear,
    storeUrl: epicStoreProductUrl(slug),
    homepageUrl,
    discordInviteUrl,
    coverImage,
    screenshots,
    videos: videos.slice(0, MAX_VIDEOS),
    systemRequirements: formatSystemRequirements(data),
  };
}

export async function fetchEpicStoreMedia(slug: string): Promise<{
  coverImage: string | null;
  screenshots: string[];
  videos: string[];
}> {
  const product = await fetchEpicProductWithFallback(slug);
  const extracted = extractEpicProduct(product, slug);
  return {
    coverImage: extracted.coverImage,
    screenshots: extracted.screenshots,
    videos: extracted.videos,
  };
}
