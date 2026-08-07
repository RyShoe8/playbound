import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/db";
import DiscordConnection from "@/lib/models/DiscordConnection";
import { encryptString } from "@/lib/encryption";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("pb_discord_oauth_state")?.value;
  const userId = jar.get("pb_discord_oauth_uid")?.value;
  // Resolved against the incoming request so the user stays on the host they
  // are actually browsing, rather than wherever NEXTAUTH_URL happens to point.
  const back = (query: string) => new URL(`/profile?${query}`, req.url);

  if (!code || !state || !expected || state !== expected || !userId) {
    return NextResponse.redirect(back("discord=error"));
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = new URL("/api/auth/discord/callback", req.url).toString();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(back("discord=error"));
  }

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    return NextResponse.redirect(back("discord=error"));
  }
  const token = (await tokenRes.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!token.access_token || !token.refresh_token || typeof token.expires_in !== "number") {
    return NextResponse.redirect(back("discord=error"));
  }

  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    return NextResponse.redirect(back("discord=error"));
  }
  const me = (await meRes.json()) as {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string | null;
  };

  const avatarUrl = me.avatar
    ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
    : null;

  await dbConnect();
  
  const encryptedAccess = encryptString(token.access_token);
  const encryptedRefresh = encryptString(token.refresh_token);
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);

  await DiscordConnection.findOneAndUpdate(
    { userId },
    {
      $set: {
        discordId: me.id,
        username: me.username,
        globalName: me.global_name || null,
        avatar: avatarUrl,
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        linkedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  const res = NextResponse.redirect(back("discord=linked"));
  res.cookies.delete("pb_discord_oauth_state");
  res.cookies.delete("pb_discord_oauth_uid");
  return res;
}
