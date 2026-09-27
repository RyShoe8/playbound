import type { ModSeed } from "./modSeedHelpers";

/** Hanfling's original archive: it contains Help/HX and System/HX.*, no base-game files. */
export const DEUS_EX_HX_URL = "https://builds.hx.hanfling.de/testing/HX-0.9.89.4.zip";

export const deusExMods: ModSeed[] = [{
  slug: "deus-ex-hx",
  title: "HX — Deus Ex Co-op",
  tagline: "Take the original Deus Ex campaign online with a friend.",
  description: "HX turns Deus Ex's campaign into a shared mission. Every player needs Deus Ex: Game of the Year Edition and the same HX build; launch System/HX.exe to host or join.",
  baseGameSlug: "deus-ex",
  developerSlug: "sebastian-kaufel",
  license: "Creator-owned; redistribution terms not stated",
  releaseYear: 2015,
  sizeMB: 2.4,
  website: "https://builds.hx.hanfling.de/testing/",
  downloadKind: "direct-zip",
  directUrl: DEUS_EX_HX_URL,
  installRelativePath: ".",
  art: { from: "#12392e", to: "#a3a73f", icon: "Users" },
  coverImage: "https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/6910/library_600x900_2x.jpg",
  published: true,
  managedBy: "admin",
  platforms: ["Windows"],
  longDescription: "Deus Ex was built for one JC Denton. HX lets a group run the original campaign together, with each player bringing their own agent into the same missions. The fun is in coordinating the plans Deus Ex usually leaves to one person: one player watches a patrol while another finds a way around the lock, and a botched stealth attempt becomes everybody's problem. PlayBound downloads Hanfling's original HX archive and installs it into your existing Deus Ex GOTY folder. Start HX.exe, not DeusEx.exe. For a separate copy that leaves the original installation untouched, choose the PlayBound HX Co-op Edition instead. HX is an alpha build: expect rough edges and keep the same version on every PC.",
  whatItChanges: "Adds the HX client, game mode, and campaign co-op files without replacing the original Deus Ex executable.",
  compatibility: "Requires a legal Windows installation of Deus Ex GOTY, version 1.112fm. Use matching HX versions on every PC. GMDX is not supported with HX.",
  installSteps: [
    { platform: "windows", text: "Install Deus Ex: Game of the Year Edition from GOG or Steam." },
    { platform: "windows", text: "Click Install in PlayBound. The HX archive is extracted beside your Deus Ex System folder." },
    { platform: "windows", text: "Launch System/HX.exe. Join a PlayBound party to host or connect over its private network." },
  ],
  faq: [
    { q: "Does HX include Deus Ex?", a: "No. Every player needs their own legal Deus Ex GOTY installation." },
    { q: "Can I use GMDX with HX?", a: "No. Keep HX separate from GMDX; use the isolated PlayBound HX Co-op Edition if you want to preserve your original game files." },
    { q: "Can I save campaign progress?", a: "HX does not provide normal campaign savegames. Plan on completing a mission in one session or starting a later mission fresh." },
  ],
}];
