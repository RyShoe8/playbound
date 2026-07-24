import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Upload } from "lucide-react";
import { developers, gamesByDeveloper } from "@/lib/data";
import { Avatar, Badge } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Developers" };

export default function DevelopersPage() {
  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Developers</h1>
          <p className="mt-1 text-muted-foreground">
            The studios and teams behind every free game on PlayBound. Follow them to hear the
            moment they ship.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Upload className="size-4 text-primary" /> Publish on PlayBound
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            Upload a build, add artwork and metadata, pick a launch method, submit for review.
            Publishing a game should feel like publishing a blog post.
          </p>
          <button className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground transition-all hover:brightness-110">
            Open Developer Portal
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {developers.map((dev) => {
          const devGames = gamesByDeveloper(dev.slug);
          return (
            <Link
              key={dev.slug}
              href={`/developers/${dev.slug}`}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <Avatar name={dev.name} hue={dev.artHue} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold">
                    <span className="truncate">{dev.name}</span>
                    {dev.firstParty && <Badge tone="brand">First-Party</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{dev.tagline}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {devGames.length} game{devGames.length === 1 ? "" : "s"} ·{" "}
                  {Intl.NumberFormat("en", { notation: "compact" }).format(dev.followers)} followers
                </span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
