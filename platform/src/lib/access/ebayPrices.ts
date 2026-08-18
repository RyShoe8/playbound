/**
 * Parse prices out of eBay search and item HTML.
 *
 * eBay has no public catalog API we can call without an app id. Search
 * result pages still list each card's price, so a pasted search URL can
 * supply the lowest listing (price + shipping) without rewriting the link.
 */

function dollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const m = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number.parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function firstPriceIn(text: string): number | null {
  const range = text.match(/\$?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:to|–|-)\s*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i);
  if (range) return dollarsToCents(range[1]);
  const single = text.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  if (single) return dollarsToCents(single[1]);
  return dollarsToCents(text);
}

function shippingCents(text: string): number {
  if (/free\s+shipping/i.test(text)) return 0;
  if (/shipping\s+not\s+specified/i.test(text)) return 0;
  const m = text.match(/\+?\s*\$\s*(\d[\d,]*(?:\.\d{1,2})?)/);
  return m ? dollarsToCents(m[1]) ?? 0 : 0;
}

function decode(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEbayItemUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return /\/itm\//i.test(u.pathname);
  } catch {
    return false;
  }
}

export function isEbaySearchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (isEbayItemUrl(url)) return false;
    if (/\/sch\//i.test(u.pathname)) return true;
    if (u.searchParams.has("_nkw")) return true;
    return /\/b\//i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Sort by price + shipping, lowest first, without changing the stored URL. */
export function withEbayPriceSort(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("_sop")) u.searchParams.set("_sop", "15");
    return u.toString();
  } catch {
    return url;
  }
}

function cardHasItem(card: string): boolean {
  if (/shop on ebay/i.test(decode(card))) return false;
  return /\/itm\/\d+/i.test(card) || /itemprop=["']item["']/i.test(card);
}

function cardAllInCents(card: string): number | null {
  const priceBlock =
    card.match(/s-item__price[^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
    card.match(/itemprop=["']price["'][^>]*content=["']([^"']+)/i)?.[1] ||
    card.match(/class="[^"]*s-card__price[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1];
  if (!priceBlock) return null;
  const price = firstPriceIn(decode(priceBlock));
  if (price == null) return null;
  const shipBlock =
    card.match(/s-item__logisticsCost[^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
    card.match(/s-item__shipping[^>]*>([\s\S]*?)<\/span>/i)?.[1] ||
    card.match(/s-card__shipping[^>]*>([\s\S]*?)<\/[^>]+>/i)?.[1] ||
    "";
  return price + shippingCents(decode(shipBlock));
}

/**
 * Lowest listing price (plus shipping when stated) on an eBay search page.
 * Skips the empty “Shop on eBay” template card.
 */
export function lowestEbaySearchPriceCents(html: string): number | null {
  const cards = html.split(/(?=<li[^>]*class="[^"]*s-item)|(?=<div[^>]*class="[^"]*s-item)|(?=<li[^>]*class="[^"]*s-card)|(?=<div[^>]*class="[^"]*s-card)/i);
  const prices: number[] = [];
  for (const card of cards) {
    if (!/s-item|s-card/i.test(card)) continue;
    if (!cardHasItem(card)) continue;
    const cents = cardAllInCents(card);
    if (cents != null && cents > 0) prices.push(cents);
  }
  if (prices.length > 0) return Math.min(...prices);

  const jsonPrices: number[] = [];
  for (const m of html.matchAll(/"price"\s*:\s*\{\s*"value"\s*:\s*"?(\d+(?:\.\d+)?)"?/gi)) {
    const cents = dollarsToCents(m[1]);
    if (cents) jsonPrices.push(cents);
  }
  for (const m of html.matchAll(/itemprop="price"[^>]*content="(\d+(?:\.\d+)?)"/gi)) {
    const cents = dollarsToCents(m[1]);
    if (cents) jsonPrices.push(cents);
  }
  return jsonPrices.length > 0 ? Math.min(...jsonPrices) : null;
}

export function ebayItemPriceCents(html: string): number | null {
  const meta =
    html.match(/property="product:price:amount"[^>]*content="([^"]+)"/i)?.[1] ||
    html.match(/property="og:price:amount"[^>]*content="([^"]+)"/i)?.[1] ||
    html.match(/itemprop="price"[^>]*content="([^"]+)"/i)?.[1] ||
    html.match(/"binPriceConvertedPrice"\s*:\s*"\\?\$?([\d,.]+)"/i)?.[1] ||
    html.match(/"price"\s*:\s*"\\?\$?([\d,.]+)"/i)?.[1];
  if (meta) return firstPriceIn(meta);
  const visible = html.match(/class="[^"]*x-price-primary[^"]*"[^>]*>[\s\S]*?\$[\s\S]*?(\d[\d,]*(?:\.\d{1,2})?)/i);
  if (visible) return dollarsToCents(visible[1]);
  return null;
}
