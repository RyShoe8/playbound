import Link from "next/link";
import { withOutboundUtm } from "@/lib/utm";

const year = new Date().getFullYear();
const mediaShopHref = withOutboundUtm("https://themediashop.co", { campaign: "footer" });

interface FooterLink {
  href: string;
  label: string;
  desktopOnly?: boolean;
}

interface FooterSection {
  title: string;
  links: FooterLink[];
}

const footerSections: FooterSection[] = [
  {
    title: "Play",
    links: [
      { href: "/discover", label: "Games" },
      { href: "/mods", label: "Mods" },
      { href: "/gear", label: "Gear" },
      { href: "/deals", label: "Game Deals" },
    ],
  },
  {
    title: "Multiplayer",
    links: [
      { href: "/multiplayer", label: "Multiplayer" },
      { href: "/connect", label: "Connect" },
      { href: "/play-with-friends", label: "Play Together" },
      { href: "/controls", label: "Controls" },
      { href: "/events", label: "Events" },
    ],
  },
  {
    title: "Discover",
    links: [
      { href: "/guides", label: "Guides" },
      { href: "/compare", label: "Compare" },
      { href: "/alternatives", label: "Alternatives" },
      { href: "/standards", label: "Our Standard" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/developers", label: "Developers" },
      { href: "/developer", label: "Developer Portal" },
      { href: "/submit-game", label: "Submit a Game" },
      { href: "/launcher", label: "Launcher", desktopOnly: true },
      { href: "/open-platform", label: "Trust & Architecture" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-background/80 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xs shrink-0">
            <p className="text-base font-extrabold tracking-tight">
              Play<span className="text-primary">Bound</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
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

          <nav className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 lg:gap-8">
            {footerSections.map((section) => (
              <div key={section.title} className="flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground/70">
                  {section.title}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {section.links.map(({ href, label, desktopOnly }) => (
                    <li key={href} className={desktopOnly ? "hidden lg:block" : undefined}>
                      <Link
                        href={href}
                        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 border-t border-border/60 pt-6">
          <p className="text-xs text-muted-foreground">
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
        </div>
      </div>
    </footer>
  );
}
