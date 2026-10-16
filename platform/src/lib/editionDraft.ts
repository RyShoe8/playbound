import type { Edition } from "@/lib/editionTypes";
import type {
  EditionCredit,
  EditionFaqItem,
  EditionInstallConfig,
  EditionPatchNote,
  InstallMethod,
} from "@/lib/editionTypes";
import type { HardwareRequirementsBlock } from "@/lib/hardware/types";
import type { InstallStep } from "@/lib/data/types";

/**
 * Draft shapes for the admin edition form.
 *
 * Kept out of the form component so both the create and edit pages (server
 * components) can build a draft without importing the client bundle's
 * internals, and so the empty shape lives next to the conversion from a stored
 * Edition rather than being duplicated.
 */

export interface EditionDraft {
  id?: string;
  gameSlug: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  type: string;
  status: string;
  visibility: string;
  sortOrder: number;
  isDefault: boolean;
  isStandalone?: boolean;
  branding: {
    logo: string;
    heroImage: string;
    screenshots: string[];
    videos: string[];
    artHue?: number;
  };
  links: { website: string; discord: string; wiki: string; github: string; forum: string };
  installMethod: InstallMethod;
  installConfig: EditionInstallConfig;
  requirements: { min: string; recommended: string; notes: string };
  hardwareRequirements?: HardwareRequirementsBlock | null;
  features: string[];
  tags: string[];
  aliases: string[];
  serverName: string;
  languages: string[];
  developerSlug: string;
  developerName: string;
  credits: EditionCredit[];
  license: string;
  releaseYear: number | null;
  longDescription: string;
  whyWePickedIt: string;
  bestFor: string[];
  notFor: string[];
  version: string;
  firstPlaySteps: InstallStep[];
  multiplayerGamingSteps: InstallStep[];
  patchNotes: EditionPatchNote[];
  faq: EditionFaqItem[];
  verified: boolean;
  verificationLevel: string;
  verificationNote: string;
}

export function emptyEditionDraft(gameSlug: string): EditionDraft {
  return {
    gameSlug,
    slug: "",
    name: "",
    shortDescription: "",
    description: "",
    type: "community",
    status: "active",
    visibility: "public",
    sortOrder: 0,
    isDefault: false,
    isStandalone: false,
    branding: { logo: "", heroImage: "", screenshots: [], videos: [], artHue: undefined },
    links: { website: "", discord: "", wiki: "", github: "", forum: "" },
    installMethod: "manual",
    installConfig: {
      manual: { steps: [] },
    },
    requirements: { min: "", recommended: "", notes: "" },
    hardwareRequirements: null,
    features: [],
    tags: [],
    aliases: [],
    serverName: "",
    languages: [],
    developerSlug: "",
    developerName: "",
    credits: [],
    license: "",
    releaseYear: null,
    longDescription: "",
    whyWePickedIt: "",
    bestFor: [],
    notFor: [],
    version: "",
    firstPlaySteps: [],
    multiplayerGamingSteps: [],
    patchNotes: [],
    faq: [],
    verified: false,
    verificationLevel: "untested",
    verificationNote: "",
  };
}

/** A stored edition as the form's mutable draft. */
export function editionToDraft(edition: Edition): EditionDraft {
  return {
    id: edition.id,
    gameSlug: edition.gameSlug,
    slug: edition.slug,
    name: edition.name,
    shortDescription: edition.shortDescription,
    description: edition.description,
    type: edition.type,
    status: edition.status,
    visibility: edition.visibility,
    sortOrder: edition.sortOrder,
    isDefault: edition.isDefault,
    isStandalone: Boolean(edition.isStandalone),
    branding: {
      logo: edition.branding.logo ?? "",
      heroImage: edition.branding.heroImage ?? "",
      screenshots: edition.branding.screenshots ?? [],
      videos: edition.branding.videos ?? [],
      artHue: edition.branding.artHue,
    },
    links: {
      website: edition.links.website ?? "",
      discord: edition.links.discord ?? "",
      wiki: edition.links.wiki ?? "",
      github: edition.links.github ?? "",
      forum: edition.links.forum ?? "",
    },
    installMethod: edition.installMethod,
    installConfig: edition.installConfig ?? {},
    requirements: {
      min: edition.requirements?.min ?? "",
      recommended: edition.requirements?.recommended ?? "",
      notes: edition.requirements?.notes ?? "",
    },
    hardwareRequirements: edition.hardwareRequirements ?? null,
    features: edition.features,
    tags: edition.tags,
    aliases: edition.aliases,
    serverName: edition.serverName ?? "",
    languages: edition.languages,
    developerSlug: edition.developerSlug ?? "",
    developerName: edition.developerName ?? "",
    credits: edition.credits ?? [],
    license: edition.license ?? "",
    releaseYear: edition.releaseYear ?? null,
    longDescription: edition.longDescription ?? "",
    whyWePickedIt: edition.whyWePickedIt ?? "",
    bestFor: edition.bestFor ?? [],
    notFor: edition.notFor ?? [],
    version: edition.version ?? "",
    firstPlaySteps: edition.firstPlaySteps ?? [],
    multiplayerGamingSteps: edition.multiplayerGamingSteps ?? [],
    patchNotes: edition.patchNotes ?? [],
    faq: edition.faq ?? [],
    verified: edition.verified,
    verificationLevel: edition.verificationLevel,
    verificationNote: edition.verificationNote ?? "",
  };
}
