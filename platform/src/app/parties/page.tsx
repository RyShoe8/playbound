import type { Metadata } from "next";
import Link from "next/link";
import { PartyPopper, Users } from "lucide-react";
import { pageMetadata } from "@/lib/seo";
import { listOpenPublicParties } from "@/lib/playTogether/party";
import { JoinPartyButton } from "@/components/friends/JoinPartyButton";
import type { PartyPayload } from "@/lib/playTogether/types";

export const metadata: Metadata = pageMetadata({
  title: "Open Parties — PlayBound",
  description: "Public parties waiting for players, grouped by game. Join a lobby or drop into a session with space.",
  path: "/parties",
});

export const dynamic = "force-dynamic";

function groupByGame(parties: PartyPayload[]): { slug: string; title: string; parties: PartyPayload[] }[] {
  const map = new Map<string, { slug: string; title: string; parties: PartyPayload[] }>();
  for (const party of parties) {
    const slug = party.gameSlug;
    const existing = map.get(slug);
    if (existing) {
      existing.parties.push(party);
    } else {
      map.set(slug, {
        slug,
        title: party.gameTitle || party.gameSlug,
        parties: [party],
      });
    }
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export default async function PartiesPage() {
  const parties = await listOpenPublicParties(100);
  const groups = groupByGame(parties);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <PartyPopper className="size-3.5" /> Open parties
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">Join a party</h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Public lobbies waiting for players, plus in-progress games with space. Create your own from{" "}
          <Link href="/friends" className="font-semibold text-primary hover:underline">
            Friends
          </Link>
          .
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="font-semibold">No open public parties right now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start one from Friends and set it to Public so others can find it here.
          </p>
          <Link
            href="/friends"
            className="mt-4 inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
          >
            Create a party
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.slug} id={group.slug} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-bold">
                  <Link href={`/games/${group.slug}`} className="hover:text-primary hover:underline">
                    {group.title}
                  </Link>
                </h2>
                <p className="text-xs text-muted-foreground">
                  {group.parties.length} open {group.parties.length === 1 ? "party" : "parties"}
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {group.parties.map((party) => (
                  <li
                    key={party.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{party.leaderUsername}&apos;s party</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {party.status === "playing" ? "In progress — space left" : "Waiting for players"}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                        <Users className="size-3" />
                        {party.members.length}/{party.maxSize}
                      </span>
                    </div>
                    <div className="mt-auto flex items-center justify-end">
                      <JoinPartyButton party={party} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
