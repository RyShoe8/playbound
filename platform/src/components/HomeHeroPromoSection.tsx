"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  X,
  Sparkles,
  Download,
  Users,
  Gauge,
  Cloud,
  ShieldCheck,
  ChevronRight,
  MonitorPlay,
  Layers,
  ShoppingCart,
} from "lucide-react";
import type { Game } from "@/lib/data/types";
import { GameArt } from "@/components/GameArt";
import { PlayCta } from "@/components/GameCard";
import { Badge } from "@/components/ui/bits";
import { useCompatibilityFilter } from "@/hooks/useCompatibilityFilter";
import { useDiscoveryMode } from "@/hooks/useDiscoveryMode";
import { isGameCompatible } from "@/lib/compatibility/compatibility";
import { CatalogStatsCard } from "@/components/ActivityStatsCard";
import type { CatalogLiveStats } from "@/lib/liveActivity";
import { directPurchaseRequired } from "@/lib/access/resolver";
import { accessPriceLabel } from "@/lib/access/discoveryMode";
import { formatEditionChipName, getDisplayEditionsForGame } from "@/lib/data/editions";

interface HomeHeroPromoSectionProps {
  gamesNewestFirst: Game[];
  games: Array<{ slug: string }>;
  live: CatalogLiveStats;
  openPartyCount?: number;
}

function FeaturedGameHero({ hero, badge }: { hero: Game; badge: string }) {
  const blurb = hero.tagline?.trim() || hero.description?.trim() || "";
  const meta = [hero.genres.filter(Boolean).join(" / "), hero.releaseYear]
    .filter(Boolean)
    .join(" · ");
  const isPaid = directPurchaseRequired(hero.access);
  const price = accessPriceLabel(hero.access?.currentPriceCents ?? null);
  const buyOffer = hero.access?.offers?.[0];
  const displayEditions = getDisplayEditionsForGame(hero.slug);

  return (
    <section className="relative h-full overflow-hidden rounded-2xl border border-border shadow-md">
      <GameArt
        game={hero}
        showTitle={false}
        className="pointer-events-none absolute inset-0 z-0"
        iconSize="lg"
      />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-black/90 via-black/60 to-black/20" />
      <Link
        href={`/games/${hero.slug}`}
        className="absolute inset-0 z-[2]"
        aria-label={`${hero.title} — view game`}
      />
      <div className="pointer-events-none relative z-[3] flex h-full min-h-[340px] flex-col justify-end gap-3.5 p-6 sm:p-8 lg:max-w-2xl">
        <Badge tone="play" className="w-fit">
          <Sparkles className="size-3" /> {badge}
        </Badge>
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          {hero.title}
        </h2>
        {blurb ? (
          <p className="line-clamp-2 max-w-xl text-sm text-white/85 sm:text-base">{blurb}</p>
        ) : null}
        {meta ? <p className="text-xs text-white/70">{meta}</p> : null}

        {displayEditions.length > 0 && (
          <div className="pointer-events-auto relative z-[4] flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs font-bold text-white/90">Editions:</span>
            {displayEditions.map((ed) => (
              <Link
                key={ed.slug}
                href={`/games/${hero.slug}/editions/${ed.slug}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/50 px-3 py-1 text-xs font-semibold text-white/95 backdrop-blur transition-all hover:border-primary/60 hover:bg-primary/25 hover:text-white hover:scale-105"
              >
                <Layers className="size-3 text-primary" />
                {formatEditionChipName(ed.name)}
              </Link>
            ))}
          </div>
        )}

        <div className="pointer-events-auto relative z-[4] mt-2 flex flex-wrap items-center gap-3">
          {isPaid ? (
            <>
              {buyOffer ? (
                <a
                  href={buyOffer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-play px-5 text-sm font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px"
                >
                  <ShoppingCart className="size-4" />
                  Buy {buyOffer.retailer ? `on ${buyOffer.retailer}` : "Game"} — {price}
                </a>
              ) : (
                <Link
                  href={`/games/${hero.slug}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-play px-5 text-sm font-bold text-play-foreground shadow-[0_0_24px_-6px_var(--play)] transition-all hover:brightness-110 active:translate-y-px"
                >
                  <ShoppingCart className="size-4" />
                  Buy Game — {price}
                </Link>
              )}
              <Link
                href={`/games/${hero.slug}`}
                className="inline-flex h-10 items-center rounded-full border border-white/25 bg-white/10 px-5 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                View Editions & Details
              </Link>
            </>
          ) : (
            <>
              <PlayCta game={hero} size="md" />
              <Link
                href={`/games/${hero.slug}`}
                className="inline-flex h-9 items-center rounded-full border border-white/25 bg-white/10 px-5 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                Learn More
              </Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function HomeHeroPromoSection({
  gamesNewestFirst,
  games,
  live,
  openPartyCount = 0,
}: HomeHeroPromoSectionProps) {
  const { data: session, status } = useSession();
  const { mode, device } = useCompatibilityFilter();
  const { mode: discoveryMode, setMode: setDiscoveryMode } = useDiscoveryMode();
  const [showPromo, setShowPromo] = useState<boolean>(true);
  const admin = session?.user?.role === "admin";

  useEffect(() => {
    if (status === "loading") return;
    try {
      if (admin) {
        setShowPromo(sessionStorage.getItem("playbound_promo_session_dismissed") !== "true");
        return;
      }

      const dismissed = localStorage.getItem("playbound_promo_dismissed");
      if (dismissed === "true") {
        setShowPromo(false);
        return;
      }

      // Track distinct session visits
      const sessionCounted = sessionStorage.getItem("playbound_session_counted");
      let visitCount = parseInt(localStorage.getItem("playbound_visit_count") || "0", 10);
      if (!sessionCounted) {
        visitCount += 1;
        localStorage.setItem("playbound_visit_count", visitCount.toString());
        sessionStorage.setItem("playbound_session_counted", "true");
      }

      if (visitCount > 2) {
        setShowPromo(false);
      } else {
        setShowPromo(true);
      }
    } catch {
      setShowPromo(admin);
    }
  }, [status, admin]);

  const handleDismiss = () => {
    setShowPromo(false);
    try {
      if (admin) {
        sessionStorage.setItem("playbound_promo_session_dismissed", "true");
      } else {
        localStorage.setItem("playbound_promo_dismissed", "true");
      }
    } catch {
      // ignore
    }
  };

  const hero =
    (mode === "compatible"
      ? gamesNewestFirst.find((g) => isGameCompatible(g, device.type))
      : gamesNewestFirst[0]) ?? gamesNewestFirst[0];

  const promoPillars = [
    {
      icon: ShieldCheck,
      title: "Worth Playing",
      tagline: "Four-point quality standard",
      desc: "Every title must be worth the cost, fun today, tested by PlayBound, and have That One Thing we'd excitedly tell a friend about.",
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    },
    {
      icon: Download,
      title: "1-Click Installs",
      tagline: "Games, editions & mods",
      desc: "Install full games, community total conversions, and custom map packs in a single click with zero file wrangling.",
      color: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    },
    {
      icon: Users,
      title: "Multiplayer & Community Hub",
      tagline: "Live servers, parties & brackets",
      desc: "Real-time server browser with live player counts, Discord chat integration, custom party lobbies, and automated tournament brackets.",
      color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
    {
      icon: Gauge,
      title: "System Matcher & Hardware Grader",
      tagline: "Know before you download",
      desc: "Automatic hardware grading evaluates your CPU, GPU, and RAM to tell you if a game will run Great, Playable, or Needs an Upgrade.",
      color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    },
    {
      icon: Cloud,
      title: "Seamless Cloud Saves",
      tagline: "Sync progression anywhere",
      desc: "Automatic cross-device save backups and progression sync so your campaign progress and configurations travel with you.",
      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── State A: Full Playbound Promotional Showcase (First 2 visits, not dismissed) ── */}
      {showPromo && (
        <section
          aria-label="PlayBound Platform Features"
          className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-b from-card via-card/95 to-secondary/30 p-6 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.6)] backdrop-blur transition-all duration-300 sm:p-8"
        >
          {/* Subtle glowing ambient backdrop */}
          <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full bg-cyan-500/10 blur-3xl" />

          {/* Dismiss Button */}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close promotion banner"
            className="absolute top-4 right-4 z-20 flex size-9 items-center justify-center rounded-full border border-border/80 bg-secondary/80 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-secondary hover:text-foreground active:scale-95 sm:top-6 sm:right-6"
          >
            <X className="size-4" />
          </button>

          <div className="relative z-10">
            {/* Header / Intro */}
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="play">
                  <Sparkles className="size-3" /> Discover. Play. Connect.
                </Badge>
                <span className="text-xs font-semibold text-muted-foreground">
                  Free and exceptional value up to $15
                </span>
              </div>

              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
                Discover. Play.{" "}
                <span className="bg-gradient-to-r from-primary via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  Connect.
                </span>
              </h1>

              <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                Great games don&apos;t have to cost $70. PlayBound finds exceptional free and affordable
                games, tests them, improves them with the best community tools and mods, and makes
                them easier to install and play together.
              </p>

              <div className="mt-5 max-w-xl rounded-2xl border border-border bg-secondary/40 p-4">
                <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  Explore PlayBound
                </p>
                <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Discovery mode">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={discoveryMode === "FREE"}
                    onClick={() => setDiscoveryMode("FREE")}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                      discoveryMode === "FREE"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    FREE
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={discoveryMode === "ALL"}
                    onClick={() => setDiscoveryMode("ALL")}
                    className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                      discoveryMode === "ALL"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ALL
                  </button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {discoveryMode === "FREE"
                    ? "Only show me games I can play without spending anything."
                    : "Show me every PlayBound-approved game up to $15."}
                </p>
              </div>
            </div>

            {/* 5 Core Pillars Grid */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {promoPillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.title}
                    className="group relative flex flex-col rounded-xl border border-border/70 bg-card/60 p-4 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-card hover:shadow-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${pillar.color}`}
                      >
                        <Icon className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-bold text-foreground">
                          {pillar.title}
                        </h2>
                        <p className="truncate text-[11px] font-medium text-muted-foreground">
                          {pillar.tagline}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-muted-foreground/90">
                      {pillar.desc}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Action Bar */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-5">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/download"
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-play px-5 text-sm font-bold text-play-foreground shadow-[0_0_20px_-5px_var(--play)] transition-all hover:brightness-110 active:translate-y-px"
                >
                  <Download className="size-4" /> Get PlayBound Launcher
                </Link>
                <Link
                  href="/discover"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-5 text-sm font-semibold text-secondary-foreground transition-colors hover:border-primary/30 hover:bg-secondary"
                >
                  <MonitorPlay className="size-4" /> Browse Catalog
                </Link>
                <Link
                  href="/mods"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-5 text-sm font-semibold text-secondary-foreground transition-colors hover:border-primary/30 hover:bg-secondary"
                >
                  <Layers className="size-4" /> Explore Mods
                </Link>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span>{games.length} Verified Games</span>
                <span>•</span>
                <span>One new curation every Wednesday</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Main Hero & Stats Section ── */}
      {/* When promo is visible: HomeHero is full width and CatalogStatsCard is placed neatly,
          OR when promo is dismissed/closed: HomeHero and CatalogStatsCard are in the SAME TOP ROW! */}
      {showPromo ? (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1">
            {hero ? <FeaturedGameHero hero={hero} badge="Newest Addition" /> : null}
          </div>
          <div className="flex w-full shrink-0 lg:w-80">
            <CatalogStatsCard live={live} openPartyCount={openPartyCount} />
          </div>
        </div>
      ) : (
        /* Elevated Compact Layout (Dismissed Promo / 3rd+ visit): Hero & Stats in the SAME ROW */
        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1">
            {hero ? <FeaturedGameHero hero={hero} badge="Featured New Game" /> : null}
          </div>
          <div className="flex w-full shrink-0 lg:w-80">
            <CatalogStatsCard live={live} openPartyCount={openPartyCount} />
          </div>
        </div>
      )}
    </div>
  );
}
