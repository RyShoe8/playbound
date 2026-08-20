import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import CatalogGame from "@/lib/models/CatalogGame";

/**
 * Asks the Discord worker to provision (or refresh) the PlayBound channel for a game.
 * Requires DISCORD_BOT_WEBHOOK_URL + BOT_WEBHOOK_SECRET on the Next deployment.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const { slug } = await params;
  await dbConnect();
  const game = await CatalogGame.findOne({ slug }).lean();
  if (!game) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const webhook = process.env.DISCORD_BOT_WEBHOOK_URL;
  const secret = process.env.BOT_WEBHOOK_SECRET;
  if (!webhook || !secret) {
    return NextResponse.json(
      {
        error:
          "Discord bot webhook not configured. Set DISCORD_BOT_WEBHOOK_URL and BOT_WEBHOOK_SECRET, or paste invite fields manually.",
      },
      { status: 503 }
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(webhook.replace(/\/$/, "") + "/provision", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({ slug }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error || data || `Provision failed (${res.status})` },
        { status: 502 }
      );
    }

    // Worker writes Mongo directly; re-read for response.
    const updated = await CatalogGame.findOne({ slug })
      .select("communityLinks")
      .lean();
    return NextResponse.json({
      success: true,
      playboundDiscord: updated?.communityLinks?.playboundDiscord ?? data?.playboundDiscord,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        {
          error:
            "Discord bot worker timed out after 15s. Check that your Render bot service is deployed and running.",
        },
        { status: 504 }
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Discord bot error: ${err.message}`
            : "Could not reach Discord bot worker",
      },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
