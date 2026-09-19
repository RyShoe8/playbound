import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Party from "@/lib/models/Party";
import { getGame } from "@/lib/catalog";
import { gameRequiresPurchase } from "@/lib/access/resolver";
import { countLookingToPartyByGame } from "@/lib/playTogether/lookingToParty";
import { getGameLiveStats } from "@/lib/liveActivity";
import { supportsLauncherParty } from "@/lib/multiplayer/support";
import {
  getMultiplayerActivitySnapshot,
  type GameMultiplayerActivity,
  type MultiplayerActivityResponse,
} from "@/lib/multiplayer/activity";

export type { GameMultiplayerActivity, MultiplayerActivityResponse };

function isMmoGame(game: { tags?: string[]; features?: string[]; genre?: string; slug?: string }): boolean {
  const haystack = [game.genre || "", ...(game.tags ?? []), ...(game.features ?? []), game.slug || ""].join(" ").toLowerCase();
  return haystack.includes("mmo") || haystack.includes("mmorpg") || haystack.includes("runescape") || haystack.includes("everquest");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requestedSlug = url.searchParams.get("slug");

  try {
    // 1. If a single game is requested, return fast
    if (requestedSlug) {
      let hasDb = false;
      try {
        if (process.env.MONGODB_URI && process.env.MONGODB_URI !== "[SENSITIVE]") {
          await dbConnect();
          hasDb = true;
        }
      } catch (dbErr) {
        console.warn("Multiplayer activity: DB connection failed, using offline fallback:", dbErr);
      }

      const game = await getGame(requestedSlug);
      if (!game) {
        return NextResponse.json({ error: "Game not found" }, { status: 404 });
      }

      const [stats, ltpCounts, openPartyCount] = await Promise.all([
        getGameLiveStats(requestedSlug).catch(() => ({
          playingNow: 0,
          multiplayerPlayers: 0,
          platformPlayers: 0,
          serverCount: 0,
        })),
        hasDb
          ? countLookingToPartyByGame().catch((): Record<string, number> => ({}))
          : Promise.resolve<Record<string, number>>({}),
        hasDb
          ? Party.countDocuments({
              visibility: "public",
              status: { $in: ["waiting", "preparing", "ready", "playing"] },
              gameSlug: requestedSlug,
            }).catch(() => 0)
          : Promise.resolve(0),
      ]);

      const usersLooking = ltpCounts[requestedSlug] || 0;
      const isMmo = isMmoGame(game);
      const activity: GameMultiplayerActivity = {
        gameSlug: game.slug,
        gameTitle: game.title,
        coverImage: game.coverImage || null,
        heroImage: null,
        tags: game.tags,
        genre: game.genres?.[0] || undefined,
        isFree: !gameRequiresPurchase(game.access),
        openPartyCount,
        usersLookingCount: usersLooking,
        serversOnline: stats.serverCount || 0,
        serverPlayerCount: stats.multiplayerPlayers || 0,
        platformPlayerCount: stats.platformPlayers || 0,
        isMmo,
        supportsDirectJoin: game.launchMethods.includes("server"),
        supportsParty: supportsLauncherParty(game),
        score: openPartyCount * 20 + usersLooking * 10 + (stats.multiplayerPlayers || 0),
        updatedAt: new Date().toISOString(),
      };

      return NextResponse.json(
        {
          activity,
          asOf: new Date().toISOString(),
        },
        {
          headers: {
            "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          },
        }
      );
    }

    // 2. Full multiplayer discovery catalog snapshot (cached)
    const response = await getMultiplayerActivitySnapshot();

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    console.error("Multiplayer activity endpoint error:", err);
    return NextResponse.json(
      { error: "Failed to load multiplayer activity" },
      { status: 500 }
    );
  }
}
