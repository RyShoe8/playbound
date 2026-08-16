import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import crypto from "crypto";

export async function GET(req: Request) {
  const incoming = new URL(req.url);
  const from = incoming.searchParams.get("from") === "launcher" ? "launcher" : "web";
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    const next = from === "launcher"
      ? "/api/auth/discord/start?from=launcher"
      : "/api/auth/discord/start";
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(next)}`, req.url));
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = new URL("/api/auth/discord/callback", req.url).toString();
  if (!clientId) {
    return NextResponse.json({ error: "Discord OAuth not configured" }, { status: 503 });
  }

  const state = crypto.randomBytes(16).toString("hex");
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");

  const res = NextResponse.redirect(url.toString());
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  };
  res.cookies.set("pb_discord_oauth_state", state, cookie);
  res.cookies.set("pb_discord_oauth_uid", session.user.id, cookie);
  res.cookies.set("pb_discord_oauth_from", from, cookie);
  return res;
}
