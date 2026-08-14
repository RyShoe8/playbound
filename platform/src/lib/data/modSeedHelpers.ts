import type { GameFaq, InstallStep } from "./types";

export type ModSeed = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  baseGameSlug: string;
  developerSlug: string;
  license: string;
  releaseYear: number;
  sizeMB: number;
  website: string;
  githubRepo?: string | null;
  downloadKind: "github-zip" | "direct-zip" | "external";
  assetPattern?: string | null;
  directUrl?: string | null;
  installRelativePath: string;
  art?: { from: string; to: string; icon: string };
  coverImage?: string;
  screenshots?: string[];
  videos?: string[];
  published: boolean;
  managedBy: "admin" | "developer";
  longDescription?: string;
  whatItChanges?: string;
  compatibility?: string;
  /** Empty/omit = all OSes. Windows / macOS / Linux only. */
  platforms?: ("Windows" | "macOS" | "Linux")[];
  installSteps?: InstallStep[];
  faq?: GameFaq[];
};

/** Publish-ready editorial (~90+ words) so seed mods clear admin gates. */
export function modCopy(opts: {
  title: string;
  baseTitle: string;
  summary: string;
  changes: string;
  installHint?: string;
}): { longDescription: string; whatItChanges: string } {
  const install =
    opts.installHint ||
    `Use the PlayBound launcher to drop the archive into the correct ${opts.baseTitle} content folder, then enable the mod from the game's mod or content menu.`;
  const longDescription = [
    `${opts.title} is a community add-on for ${opts.baseTitle}. ${opts.summary}`,
    install,
    `Mods are versioned separately from the base game — match the recommended engine or client release before joining multiplayer, and keep a clean backup of your settings if you experiment with several packs at once.`,
    `PlayBound only lists projects that publish redistributable archives or clear external download pages. Always read the upstream README for credits, required assets, and known incompatibilities.`,
  ].join(" ");
  return { longDescription, whatItChanges: opts.changes };
}

export function ghMod(
  partial: Omit<ModSeed, "published" | "managedBy" | "longDescription" | "whatItChanges"> & {
    summary: string;
    changes: string;
    baseTitle: string;
    installHint?: string;
  }
): ModSeed {
  const { summary, changes, baseTitle, installHint, ...rest } = partial;
  const editorial = modCopy({
    title: rest.title,
    baseTitle,
    summary,
    changes,
    installHint,
  });
  return {
    ...rest,
    published: true,
    managedBy: "admin",
    ...editorial,
  };
}
