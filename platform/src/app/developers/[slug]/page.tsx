import { notFound } from "next/navigation";
import { Bell, Globe, MapPin, MessagesSquare } from "lucide-react";
import { developersBySlug, gamesByDeveloper, newsFor } from "@/lib/data";
import { CardRow, GameCard } from "@/components/GameCard";
import { Avatar, Badge, SectionHeader, StatTile } from "@/components/ui/bits";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dev = developersBySlug.get(slug);
  return { title: dev ? dev.name : "Developer Not Found" };
}

export default async function DeveloperPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dev = developersBySlug.get(slug);
  if (!dev) notFound();

  const devGames = gamesByDeveloper(dev.slug);
  const devNews = devGames.flatMap((g) => newsFor(g.slug));
  const totalPlayers = devGames.reduce((s, g) => s + g.playersOnline, 0);

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      <section
        className="relative overflow-hidden rounded-2xl border border-border p-6 sm:p-8"
        style={{
          background: `linear-gradient(135deg, oklch(0.3 0.09 ${dev.artHue} / 60%), var(--card) 65%)`,
        }}
      >
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={dev.name} hue={dev.artHue} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-extrabold tracking-tight">{dev.name}</h1>
              {dev.firstParty && <Badge tone="brand">First-Party Studio</Badge>}
            </div>
            <p className="mt-1 text-muted-foreground">{dev.tagline}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="size-3" /> {dev.location}
              </span>
              <span>Founded {dev.founded}</span>
              <a href={dev.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground hover:underline">
                <Globe className="size-3" /> Website
              </a>
              {dev.discord && (
                <span className="flex items-center gap-1">
                  <MessagesSquare className="size-3" /> discord/{dev.discord}
                </span>
              )}
            </div>
          </div>
          <button className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-all hover:brightness-110">
            <Bell className="size-4" /> Follow
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Games" value={String(devGames.length)} />
        <StatTile label="Followers" value={Intl.NumberFormat("en", { notation: "compact" }).format(dev.followers)} />
        <StatTile label="Players Online" value={Intl.NumberFormat("en").format(totalPlayers)} hint="across all titles" />
        <StatTile label="On PlayBound Since" value={String(Math.max(dev.founded, 2025))} />
      </div>

      <section>
        <h2 className="text-lg font-bold">About</h2>
        <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">{dev.about}</p>
      </section>

      <section>
        <SectionHeader title="Games" subtitle={`Everything by ${dev.name} on PlayBound`} />
        <CardRow>
          {devGames.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </CardRow>
      </section>

      {devNews.length > 0 && (
        <section>
          <SectionHeader title="News & Devlogs" subtitle="Followers get notified the moment these publish" />
          <div className="grid gap-3 lg:grid-cols-2">
            {devNews.map((n) => (
              <article key={n.title} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone="brand">{n.kind}</Badge> {n.date}
                </div>
                <h3 className="mt-2 font-bold">{n.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{n.summary}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
