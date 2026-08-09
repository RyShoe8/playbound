import { notFound } from "next/navigation";
import { Globe, MapPin, Newspaper } from "lucide-react";
import { getDeveloper } from "@/lib/developers";
import { gamesByDeveloper } from "@/lib/catalog";
import { fetchGithubReleases } from "@/lib/github";
import { CompatibleCardRow } from "@/components/CompatibleCardRow";
import { Avatar, Badge, SectionHeader, StatTile } from "@/components/ui/bits";
import { withOutboundUtm } from "@/lib/utm";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dev = await getDeveloper(slug);
  return { title: dev ? dev.name : "Developer Not Found" };
}

export default async function DeveloperPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dev = await getDeveloper(slug);
  if (!dev) notFound();

  const devGames = await gamesByDeveloper(dev.slug);
  const repo = devGames.find((g) => g.githubRepo)?.githubRepo;
  const releases = repo ? await fetchGithubReleases(repo, 3) : [];

  return (
    <div className="space-y-10 px-4 py-6 sm:px-6 lg:px-8">
      <section
        className="relative overflow-hidden rounded-2xl border border-border p-6 sm:p-8"
        style={{ background: `linear-gradient(135deg, oklch(0.3 0.09 ${dev.artHue} / 60%), var(--card) 65%)` }}
      >
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={dev.name} hue={dev.artHue} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight">{dev.name}</h1>
            <p className="mt-1 text-muted-foreground">{dev.tagline}</p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="size-3" /> {dev.location}
              </span>
              <span>Founded {dev.founded}</span>
              <a
                href={withOutboundUtm(dev.website, {
                  campaign: "developer",
                  content: dev.slug,
                })}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 hover:text-foreground hover:underline"
              >
                <Globe className="size-3" /> Website
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatTile label="Games" value={String(devGames.length)} />
        <StatTile label="Founded" value={String(dev.founded)} />
        <StatTile label="Location" value={dev.location} />
      </div>

      <section>
        <h2 className="text-lg font-bold">About</h2>
        <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">{dev.about}</p>
      </section>

      <section>
        <SectionHeader title="Games" subtitle={`Everything by ${dev.name} on PlayBound`} />
        <CompatibleCardRow games={devGames} />
      </section>

      {releases.length > 0 && (
        <section>
          <SectionHeader title="Latest Releases" subtitle="Pulled live from GitHub" />
          <div className="grid gap-3 lg:grid-cols-3">
            {releases.map((r) => (
              <a
                key={r.tagName}
                href={withOutboundUtm(r.url, {
                  campaign: "developer",
                  content: dev.slug,
                })}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <Badge tone="brand">
                  <Newspaper className="size-3" /> {new Date(r.publishedAt).toLocaleDateString()}
                </Badge>
                <h3 className="mt-2 font-bold">{r.name}</h3>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
