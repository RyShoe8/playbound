import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { assertPublicHttpUrl } from "@/lib/pageMeta";
import {
  extractEpicProduct,
  fetchEpicFreeGameByPageSlug,
  fetchEpicProductWithFallback,
  parseEpicProductSlug,
} from "@/lib/epicStore";

const EPIC_HOSTS = new Set(["store.epicgames.com", "www.epicgames.com", "epicgames.com"]);

function isAllowedEpicUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return EPIC_HOSTS.has(host) || EPIC_HOSTS.has(url.hostname.toLowerCase()) || host.endsWith(".epicgames.com");
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await req.json().catch(() => ({ url: "" }));
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing or invalid URL" }, { status: 400 });
    }

    let safe: URL;
    try {
      safe = assertPublicHttpUrl(url);
    } catch {
      return NextResponse.json({ error: "That URL is not allowed" }, { status: 400 });
    }
    if (!isAllowedEpicUrl(safe)) {
      return NextResponse.json(
        { error: "Only Epic Games Store URLs are allowed" },
        { status: 400 }
      );
    }

    const slug = parseEpicProductSlug(safe.toString());
    if (!slug) {
      return NextResponse.json(
        { error: "Could not find a product slug in that Epic Store URL" },
        { status: 400 }
      );
    }

    try {
      const product = await fetchEpicProductWithFallback(slug);
      const extracted = extractEpicProduct(product, slug);
      const description = (extracted.shortDescription || extracted.description || "").slice(0, 280);
      return NextResponse.json({
        title: extracted.title,
        description,
        imageUrl: extracted.coverImage || "",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isNotFound = /not found/i.test(message) || /\(404\)/.test(message);
      if (!isNotFound) {
        console.error("Epic product fetch failed:", err);
        return NextResponse.json(
          { error: message || "Epic store lookup failed" },
          { status: 400 }
        );
      }
    }

    try {
      const free = await fetchEpicFreeGameByPageSlug(slug);
      if (free) {
        return NextResponse.json({
          title: free.title,
          description: free.description.slice(0, 280),
          imageUrl: free.imageUrl,
        });
      }
    } catch (err) {
      console.error("Epic free-games catalog lookup failed:", err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: message || "Epic store lookup failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Epic product not found" }, { status: 404 });
  } catch (error) {
    console.error("Epic Scrape Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
