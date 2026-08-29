import { NextResponse } from "next/server";
import { listServersForGame } from "@/lib/servers/registry";
import { pickBestServer, type ViewerLocation } from "@/lib/servers/pickBestServer";
import { listEditionsForGame } from "@/lib/editions";
import { getGame } from "@/lib/catalog";

/**
 * GET /api/games/[slug]/best-server — the server "Join Multiplayer" would join.
 *
 * Deliberately computed per click rather than per library render. Deciding
 * this for every game on a library page would fan out to every provider in the
 * catalog on every page load, which is the cost the Ops work spent a session
 * removing. The button's *presence* is driven by the cached activity snapshot;
 * this route is what runs when someone actually asks to join.
 *
 * Returns `server: null` rather than a bad server when nothing qualifies — the
 * caller shows "no good server right now" instead of dropping the player into
 * an empty or distant one. See pickBestServer for what qualifies.
 */

function parseCoord(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Viewer position from Vercel's edge headers — no browser permission prompt. */
function viewerFrom(req: Request): ViewerLocation {
  const lat = parseCoord(req.headers.get("x-vercel-ip-latitude"));
  const lon = parseCoord(req.headers.get("x-vercel-ip-longitude"));
  if (lat == null || lon == null) return null;
  return { lat, lon };
}

/**
 * Whether the catalog gives this game a command-line join.
 *
 * Read from the editions rather than from a list kept here, so it cannot drift
 * from what the launcher is actually told to run. The launcher additionally
 * owns connect syntax for some slugs in services/connectArgs.js, which this
 * cannot see — so a `false` here means "the catalog does not describe a join",
 * not "no join exists anywhere". Being conservative is the right direction:
 * the web hides a button it is unsure about rather than promising a join it
 * cannot deliver.
 */
async function catalogDescribesDirectJoin(slug: string): Promise<boolean> {
  try {
    const game = await getGame(slug, { includeTesting: true });
    if (!game) return false;
    const editions = await listEditionsForGame(game);
    return editions.some((edition) => {
      const config = (
        edition.installConfig as { playbound_installer?: { connectArgs?: unknown } } | undefined
      )?.playbound_installer;
      return Array.isArray(config?.connectArgs) && config.connectArgs.length > 0;
    });
  } catch (err) {
    console.error(`[best-server] edition read failed for ${slug}:`, err);
    return false;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = String(rawSlug || "").trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return NextResponse.json({ error: "Invalid game" }, { status: 400 });
  }

  try {
    const [result, canDirectJoin] = await Promise.all([
      listServersForGame(slug),
      catalogDescribesDirectJoin(slug),
    ]);

    if (!result.supported) {
      return NextResponse.json({ server: null, canDirectJoin, reason: "unsupported" });
    }

    const best = pickBestServer(result.servers ?? [], viewerFrom(req));
    if (!best) {
      // Distinguish "nobody is playing" from "we could not judge the servers",
      // because the two need different words in the UI.
      const reason = (result.servers ?? []).length === 0 ? "no-servers" : "none-suitable";
      return NextResponse.json({ server: null, canDirectJoin, reason });
    }

    const { server } = best;
    const joinUrl =
      `playbound://join/${encodeURIComponent(slug)}` +
      `?host=${encodeURIComponent(server.host)}` +
      `&port=${encodeURIComponent(String(server.port))}` +
      `&name=${encodeURIComponent(server.name || "")}`;

    return NextResponse.json({
      canDirectJoin,
      server: {
        id: server.id,
        name: server.name,
        host: server.host,
        port: server.port,
        players: best.players,
        maxPlayers: best.maxPlayers,
        map: server.map,
        gameType: server.gameType,
        mod: server.mod ?? null,
        country: server.location?.countryCode ?? null,
        latencyMs: best.latencyMs,
      },
      joinUrl,
    });
  } catch (err) {
    console.error(`[best-server] ${slug}:`, err);
    return NextResponse.json({ error: "Could not read servers" }, { status: 500 });
  }
}
