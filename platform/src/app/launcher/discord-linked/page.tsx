import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";

/*
 * Not indexed. This is the landing spot for an OAuth round trip — it says
 * "close this window" and nothing else, and it had been inheriting the
 * homepage's title, description and canonical wholesale.
 */
export const metadata: Metadata = privateMetadata("Discord Linked");

export default async function LauncherDiscordLinkedPage({
  searchParams,
}: {
  searchParams: Promise<{ discord?: string }>;
}) {
  const sp = await searchParams;
  const ok = sp.discord === "linked";
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">
        {ok ? "Discord linked" : "Couldn’t link Discord"}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {ok
          ? "You can close this window and return to the PlayBound launcher. Join the party again to hop into voice."
          : "Something went wrong. Close this window and try Link Discord from the launcher again."}
      </p>
    </div>
  );
}
