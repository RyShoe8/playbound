/**
 * Draft edition seeds for the OSS catalog wave.
 * Seed script forces unlisted + coming_soon unless overridden here.
 */
import type {
  EditionInstallConfig,
  EditionType,
  EditionStatus,
  EditionVisibility,
  InstallMethod,
  VerificationLevel,
} from "@/lib/editionTypes";

export type EditionSeed = {
  gameSlug: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  type?: EditionType;
  status?: EditionStatus;
  visibility?: EditionVisibility;
  sortOrder?: number;
  isDefault?: boolean;
  branding?: {
    logo?: string | null;
    heroImage?: string | null;
    screenshots?: string[];
    videos?: string[];
  };
  links?: {
    website?: string | null;
    discord?: string | null;
    wiki?: string | null;
    github?: string | null;
    forum?: string | null;
  };
  installMethod: InstallMethod;
  installConfig?: EditionInstallConfig;
  requirements?: { min?: string; recommended?: string; notes?: string };
  features?: string[];
  tags?: string[];
  aliases?: string[];
  serverName?: string | null;
  languages?: string[];
  version?: string | null;
  faq?: { q: string; a: string }[];
  verificationLevel?: VerificationLevel;
  verificationNote?: string | null;
};

/**
 * Wave 1 keeps most remasters as separate draft games (e.g. daggerfall-unity).
 * Placeholder for Phase 2 SWG/EQ editions — leave empty until that wave.
 */
export const editions: EditionSeed[] = [];
