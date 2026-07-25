import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { developers } from "@/lib/data";
import { gamesByDeveloper } from "@/lib/catalog";
import { Avatar } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Developers" };

export default async function DevelopersPage() {
  const rows = await Promise.all(
    developers.map(async (dev) => ({
      dev,
      count: (await gamesByDeveloper(dev.slug)).length,
    }))
  );

  return (
    <div className="space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Developers</h1>
        <p className="mt-1 text-muted-foreground">The studios and teams behind every free game on PlayBound.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ dev, count }) => (
          <Link
            key={dev.slug}
            href={`/developers/${dev.slug}`}
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <Avatar name={dev.name} hue={dev.artHue} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{dev.name}</p>
                <p className="truncate text-xs text-muted-foreground">{dev.tagline}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {count} game{count === 1 ? "" : "s"} on PlayBound
              </span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
