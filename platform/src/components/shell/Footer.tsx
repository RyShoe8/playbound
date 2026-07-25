import Link from "next/link";

const year = new Date().getFullYear();

const links = [
  { href: "/discover", label: "Discover" },
  { href: "/launcher", label: "Launcher" },
  { href: "/submit-game", label: "Submit a game" },
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
            The home of free gaming. Discover. Click Play. Have Fun.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-5xl text-xs text-muted-foreground">
        © {year}{" "}
        <a
          href="https://themediashop.co"
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
