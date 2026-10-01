import type { ModSeed } from "./modSeedHelpers";

/** Source page hosts the user's supplied, SHA-256-pinned 7z archive. */
export const BF1942_WIDESCREEN_ARCHIVE =
  "https://www.mediafire.com/file/4bptbcd4tha50jb/Battlefield_1942_Widescreen_Patch.7z/file";

export const battlefield1942Mods: ModSeed[] = [{
  slug: "battlefield-1942-widescreen-patch",
  title: "Battlefield 1942 Widescreen Patch",
  tagline: "Give the original battlefield room to breathe on a modern display.",
  description: "An optional Windows patch for higher-resolution, widescreen Battlefield 1942 play. Requires an installed copy of Battlefield 1942: World War II Anthology.",
  baseGameSlug: "battlefield-1942-anthology",
  developerSlug: "uncredited-bf1942-widescreen-patch",
  license: "Creator-owned; redistribution terms not stated",
  releaseYear: 2016,
  sizeMB: 0.06,
  website: "https://oldgamesdownload.com/file/884ed652-a1ed-4d3e-ac51-834517659b9f/",
  downloadKind: "direct-zip",
  directUrl: BF1942_WIDESCREEN_ARCHIVE,
  installerFile: "bf1942widescreenpatch.exe",
  archiveSha256: "fa7ec72bb80eb1049991deaf7114cadd28b1b2bbef006a281cca57810f7019e6",
  installRelativePath: ".",
  art: { from: "#2c382e", to: "#71735b", icon: "Monitor" },
  published: true,
  managedBy: "admin",
  platforms: ["Windows"],
  longDescription: "Battlefield 1942 was drawn for the monitors of its time. On a modern widescreen display, its original presentation can feel cramped or stretched. This optional patch opens up higher-resolution play while leaving the battles, vehicles, classes, and maps you remember intact. PlayBound fetches the archive from its existing distributor, checks it against the exact file supplied for curation, and opens the patch installer for your installed World War II Anthology. Windows may ask you to approve the installer; finish its setup before launching the game again. Keep your original game installer handy if you ever want to restore the unpatched files.",
  whatItChanges: "Runs the community widescreen patch installer against an existing Battlefield 1942 installation. It does not include the game or either expansion.",
  compatibility: "Windows Battlefield 1942: World War II Anthology, version 1.61. The patch installer may request administrator approval.",
  installSteps: [
    { platform: "windows", text: "Install Battlefield 1942: World War II Anthology and locate BF1942.exe in PlayBound." },
    { platform: "windows", text: "Choose Install for this mod. PlayBound verifies the archive and opens the patch installer; approve Windows' prompt and finish the wizard." },
  ],
  faq: [
    { q: "Does this include Battlefield 1942?", a: "No. It patches an existing Anthology installation." },
    { q: "Can PlayBound undo the patch?", a: "The installer does not expose a verified automatic rollback. Keep your original game installer if you want to restore the unpatched files." },
    { q: "Will Windows ask for administrator approval?", a: "Yes. The supplied patch executable requests elevation, so Windows shows its normal approval prompt before setup starts." },
  ],
}];
