import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/db";
import User from "@/lib/models/User";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("pb_discord_oauth_state")?.value;
  const userId = jar.get("pb_discord_oauth_uid")?.value;
  const site = process.env.NEXTAUTH_URL || "http://localhost:3000";

  if (!code || !state || !expected || state !== expected || !userId) {
    return NextResponse.redirect(`${site}/profile?discord=error`);
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(`${site}/profile?discord=error`);
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
    return NextResponse.redirect(`${site}/profile?discord=error`);
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) {
    return NextResponse.redirect(`${site}/profile?discord=error`);
  }

  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    return NextResponse.redirect(`${site}/profile?discord=error`);
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
  await User.updateOne(
    { _id: userId },
    {
      $set: {
        "connectedAccounts.discord": {
          discordUserId: me.id,
          username: me.global_name || me.username,
          avatarUrl,
          connectedAt: new Date(),
        },
      },
    }
  );

  const res = NextResponse.redirect(`${site}/profile?discord=linked`);
  res.cookies.delete("pb_discord_oauth_state");
  res.cookies.delete("pb_discord_oauth_uid");
  return res;
}
