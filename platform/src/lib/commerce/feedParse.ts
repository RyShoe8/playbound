/**
 * Parse a store product feed into title / URL / price rows.
 *
 * Feeds are not one format: affiliates send CSV, Google Merchant XML, RSS,
 * or a JSON array. We sniff the body and pull the fields matching needs.
 */

export type ParsedFeedProduct = {
  title: string;
  url: string;
  externalId: string;
  priceCents: number | null;
  listPriceCents: number | null;
};

function dollarsToCents(raw: unknown, fieldName = ""): number | null {
  const isCentsField = /cents/i.test(fieldName);
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return isCentsField && Number.isInteger(raw) ? raw : Math.round(raw * 100);
  }
  if (typeof raw === "string") {
    let text = raw.trim();
    if (text.includes(",") && !text.includes(".")) text = text.replace(",", ".");
    const n = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(n) || n < 0) return null;
    if (isCentsField && Number.isInteger(n)) return n;
    return Math.round(n * 100);
  }
  return null;
}

function asUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function pickField(
  obj: Record<string, unknown>,
  keys: string[]
): { key: string; value: unknown } | null {
  const lower = new Map(
    Object.keys(obj).map((k) => [k.toLowerCase().replace(/[:_\-\s]/g, ""), k] as const)
  );
  for (const key of keys) {
    const orig = lower.get(key.toLowerCase().replace(/[:_\-\s]/g, ""));
    if (orig == null) continue;
    const value = obj[orig];
    if (value != null && value !== "") return { key: orig, value };
  }
  return null;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  return pickField(obj, keys)?.value ?? null;
}

function productFromObject(obj: Record<string, unknown>, index: number): ParsedFeedProduct | null {
  const title = pick(obj, ["title", "name", "productname", "g:title"]);
  const url = asUrl(pick(obj, ["url", "link", "producturl", "g:link", "affiliateurl"]));
  if (typeof title !== "string" || !title.trim() || !url) return null;
  const idRaw = pick(obj, ["id", "sku", "g:id", "productid", "externalid", "guid"]);
  const priceField = pickField(obj, ["price", "g:price", "saleprice", "currentprice", "pricecents"]);
  const listField = pickField(obj, ["listprice", "regularprice", "g:price", "msrp", "originalprice"]);
  const price = dollarsToCents(priceField?.value, priceField?.key);
  const list = dollarsToCents(listField?.value, listField?.key);
  return {
    title: title.trim().slice(0, 200),
    url,
    externalId: typeof idRaw === "string" || typeof idRaw === "number" ? String(idRaw).slice(0, 120) : `row-${index}`,
    priceCents: price && price > 0 ? price : null,
    listPriceCents: list && list > 0 ? list : price && price > 0 ? price : null,
  };
}

function parseJson(body: string): ParsedFeedProduct[] {
  const json = JSON.parse(body) as unknown;
  const rows: unknown[] = Array.isArray(json)
    ? json
    : json && typeof json === "object"
      ? ((json as { products?: unknown; items?: unknown; data?: unknown }).products ??
          (json as { items?: unknown }).items ??
          (json as { data?: unknown }).data ??
          []) as unknown[]
      : [];
  if (!Array.isArray(rows)) return [];
  const out: ParsedFeedProduct[] = [];
  rows.forEach((row, i) => {
    if (row && typeof row === "object") {
      const product = productFromObject(row as Record<string, unknown>, i);
      if (product) out.push(product);
    }
  });
  return out;
}

function xmlTags(block: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    out.push(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim());
  }
  return out;
}

function parseXml(body: string): ParsedFeedProduct[] {
  const items = body.split(/<item[\s>]/i).slice(1).map((chunk) => chunk.split(/<\/item>/i)[0] ?? "");
  const entries = body.split(/<entry[\s>]/i).slice(1).map((chunk) => chunk.split(/<\/entry>/i)[0] ?? "");
  const blocks = items.length > 0 ? items : entries;
  const out: ParsedFeedProduct[] = [];
  blocks.forEach((block, i) => {
    const title = xmlTags(block, "title")[0];
    const link =
      xmlTags(block, "link")[0] ||
      (block.match(/<link[^>]+href=["']([^"']+)/i)?.[1] ?? "");
    const id = xmlTags(block, "id")[0] || xmlTags(block, "guid")[0] || `xml-${i}`;
    const priceRaw = xmlTags(block, "price")[0];
    if (!title || !asUrl(link)) return;
    const price = dollarsToCents(priceRaw);
    out.push({
      title: title.slice(0, 200),
      url: asUrl(link)!,
      externalId: id.slice(0, 120),
      priceCents: price && price > 0 ? price : null,
      listPriceCents: price && price > 0 ? price : null,
    });
  });
  return out;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

function parseCsv(body: string): ParsedFeedProduct[] {
  const lines = body.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const out: ParsedFeedProduct[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    const product = productFromObject(row, i);
    if (product) out.push(product);
  }
  return out;
}

export function parseProductFeed(body: string, contentType = ""): ParsedFeedProduct[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  const type = contentType.toLowerCase();
  try {
    if (type.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return parseJson(trimmed);
    }
    if (type.includes("xml") || trimmed.startsWith("<")) {
      return parseXml(trimmed);
    }
    return parseCsv(trimmed);
  } catch {
    if (trimmed.startsWith("<")) return parseXml(trimmed);
    return parseCsv(trimmed);
  }
}
