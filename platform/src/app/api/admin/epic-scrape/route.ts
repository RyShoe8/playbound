import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { assertPublicHttpUrl } from "@/lib/pageMeta";

const EPIC_HOSTS = new Set(["store.epicgames.com", "www.epicgames.com", "epicgames.com"]);

function isAllowedEpicUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return EPIC_HOSTS.has(host) || EPIC_HOSTS.has(url.hostname.toLowerCase()) || host.endsWith(".epicgames.com");
}

async function fetchEpicHtml(start: URL): Promise<Response> {
  let current = start;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "manual",
      next: { revalidate: 0 },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error("Redirect without location");
      }
      let nextUrl: URL;
      try {
        nextUrl = assertPublicHttpUrl(new URL(location, current).toString());
      } catch {
        throw new Error("Redirect target not allowed");
      }
      if (!isAllowedEpicUrl(nextUrl)) {
        throw new Error("Redirect host not allowed");
      }
      current = nextUrl;
      continue;
    }

    return res;
  }
  throw new Error("Too many redirects");
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

    const res = await fetchEpicHtml(safe);

    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch URL: ${res.status}` }, { status: 400 });
    }

    const html = await res.text();

    const titleMatch =
      html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
      html.match(/<title>(.*?)<\/title>/i);
    const descMatch =
      html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) ||
      html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);

    return NextResponse.json({
      title: titleMatch ? titleMatch[1].replace(/ \| Epic Games Store/gi, "").trim() : "",
      description: descMatch ? descMatch[1].trim() : "",
      imageUrl: imgMatch ? imgMatch[1].trim() : "",
    });
  } catch (error) {
    console.error("Epic Scrape Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
