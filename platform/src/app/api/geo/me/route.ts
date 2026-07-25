import { NextResponse } from "next/server";

export type ViewerGeo = {
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
};

function parseCoord(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Private viewer geo from Vercel edge IP headers (no browser permission prompt). */
export async function GET(req: Request) {
  const countryRaw = req.headers.get("x-vercel-ip-country");
  const countryCode =
    countryRaw && /^[A-Z]{2}$/i.test(countryRaw) ? countryRaw.toUpperCase() : null;
  const lat = parseCoord(req.headers.get("x-vercel-ip-latitude"));
  const lon = parseCoord(req.headers.get("x-vercel-ip-longitude"));

  const body: ViewerGeo =
    countryCode || (lat != null && lon != null)
      ? { countryCode, lat, lon }
      : { countryCode: null, lat: null, lon: null };

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
