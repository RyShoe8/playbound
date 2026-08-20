import Link from "next/link";
import { withOutboundUtm } from "@/lib/utm";

const year = new Date().getFullYear();
const mediaShopHref = withOutboundUtm("https://themediashop.co", { campaign: "footer" });

const links = [
  { href: "/discover", label: "Games" },
  { href: "/gear", label: "Gear" },
  { href: "/mods", label: "Mods" },
  { href: "/servers", label: "Servers" },
  { href: "/connect", label: "Connect" },
  { href: "/events", label: "Events" },
  { href: "/weekly", label: "Weekly" },
  { href: "/standards", label: "Our Standard" },
  { href: "/open-platform", label: "Trust & Architecture" },
  { href: "/compare", label: "Compare" },
  { href: "/alternatives", label: "Alternatives" },
  { href: "/developers", label: "Developers" },
  { href: "/launcher", label: "Launcher" },
  { href: "/submit-game", label: "Submit a game" },
  { href: "/report-bug", label: "Report a bug" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background/80 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <p className="text-sm font-extrabold tracking-tight">
            Play<span className="text-primary">Bound</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Discover. Play. Connect. Every title clears{" "}
            <Link href="/standards" className="font-semibold text-foreground/80 hover:text-primary">
              the PlayBound Bar
            </Link>{" "}
            and runs on our{" "}
            <Link href="/open-platform" className="font-semibold text-foreground/80 hover:text-primary">
              open architecture
            </Link>
            .
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={
                href === "/launcher"
                  ? "hidden text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground lg:inline"
                  : "text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-5xl text-xs text-muted-foreground">
        © {year}{" "}
        <a
          href={mediaShopHref}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-foreground/80 transition-colors hover:text-primary"
        >
          The Media Shop
        </a>
        . All rights reserved.
      </p>
    </footer>
  );
}
