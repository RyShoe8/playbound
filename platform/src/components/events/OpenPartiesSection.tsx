import Link from "next/link";
import { Users } from "lucide-react";
import { JoinPartyButton } from "@/components/friends/JoinPartyButton";
import { partyDisplayName, type PartyPayload } from "@/lib/playTogether/types";

function groupByGame(parties: PartyPayload[]): { slug: string; title: string; parties: PartyPayload[] }[] {
  const map = new Map<string, { slug: string; title: string; parties: PartyPayload[] }>();
  for (const party of parties) {
    const slug = party.gameSlug;
    if (!slug) continue;
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

export function OpenPartiesSection({ parties }: { parties: PartyPayload[] }) {
  const groups = groupByGame(parties);

  return (
    <section id="parties" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold">Open Parties</h2>
        <p className="text-sm text-muted-foreground">
          Create one from{" "}
          <Link href="/friends" className="font-semibold text-primary hover:underline">
            Friends
          </Link>
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 text-center">
          <p className="font-semibold">No open public parties right now</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start one from Friends and set it to Public so others can find it here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.slug} id={group.slug} className="space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-base font-bold">
                  <Link href={`/games/${group.slug}`} className="hover:text-primary hover:underline">
                    {group.title}
                  </Link>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {group.parties.length} open {group.parties.length === 1 ? "party" : "parties"}
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.parties.map((party) => (
                  <li
                    key={party.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-bold">{partyDisplayName(party)}</p>
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
