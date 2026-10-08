/**
 * Catalog wave — applied by `.github/workflows/apply-catalog-wave.yml`
 * (`npm run insert:catalog-wave` / `postdeploy:catalog`). Not part of `build`.
 *
 * Contract:
 *   - explicit allowlists only (never the whole seed catalog)
 *   - inserts: create only when absent; new games are draft / unpublished
 *   - patches: $set ONLY allowlisted fields on existing named docs
 *   - additive feature chips: $addToSet ONLY named drafts; never replace CMS arrays
 *   - retire editions/mods: $set archival fields only
 *   - never deletes rows, never upserts patches, never publishes a parent game
 *   - never writes a slug that is not on an allowlist
 *
 * Allowlists live in `insert-catalog-wave.allowlist.ts`.
 */
import { loadEnvConfig } from "@next/env";
import {
  ADD_GAME_FEATURES,
  FILL_MISSING_STEAM_LAUNCH,
  STEAM_CLIENT_EXE_HINTS,
  NEW_EDITION_KEYS,
  NEW_GAME_SLUGS,
  NEW_MOD_SLUGS,
  PATCH_EDITION_FIELDS,
  PATCH_GAME_FIELDS,
  SKIP_MISSING_PATCH_GAMES,
  PATCH_MOD_FIELDS,
  RETIRE_EDITION_KEYS,
  RETIRE_MOD_SLUGS,
} from "./insert-catalog-wave.allowlist";

loadEnvConfig(process.cwd());

function pickFields(
  source: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.includes(".")) {
      const [head, ...rest] = field.split(".");
      if (!head || rest.length === 0) continue;
      let cursor: unknown = source[head];
      for (const part of rest) {
        if (cursor == null || typeof cursor !== "object") {
          cursor = undefined;
          break;
        }
        cursor = (cursor as Record<string, unknown>)[part];
      }
      out[field] = cursor;
    } else {
      out[field] = source[field];
    }
  }
  return out;
}

async function main() {
  // Optional operational scope for an explicitly named game batch. The
  // scheduled/deploy wave keeps its established behavior when omitted.
  const scopeArg = process.argv.find((arg) => arg.startsWith("--games="));
  const scopedGames = scopeArg
    ? new Set(scopeArg.slice("--games=".length).split(",").map((slug) => slug.trim()).filter(Boolean))
    : null;
  const fieldsArg = process.argv.find((arg) => arg.startsWith("--fields="));
  const scopedFields = fieldsArg
    ? new Set(fieldsArg.slice("--fields=".length).split(",").map((field) => field.trim()).filter(Boolean))
    : null;
  const featuresOnly = process.argv.includes("--features-only");
  const singleFeatureArg = process.argv.find((arg) => arg.startsWith("--feature="));
  const singleFeature = singleFeatureArg?.slice("--feature=".length).trim();
  if (scopedGames && (scopedGames.size === 0 || [...scopedGames].some((slug) => !PATCH_GAME_FIELDS[slug]))) {
    throw new Error("--games must list nonempty, comma-separated slugs already in PATCH_GAME_FIELDS");
  }
  if (scopedFields && (!scopedGames || scopedFields.size === 0 || [...scopedGames].some((slug) =>
    [...scopedFields].some((field) => !PATCH_GAME_FIELDS[slug].includes(field))))) {
    throw new Error("--fields requires --games and fields allowlisted for every named game");
  }
  if (featuresOnly && (!scopedGames || scopedFields || !singleFeature ||
    [...scopedGames].some((slug) => !ADD_GAME_FEATURES[slug]?.includes(singleFeature)))) {
    throw new Error("--features-only requires --games and one allowlisted --feature, with no --fields");
  }
  if (!featuresOnly && singleFeatureArg) throw new Error("--feature requires --features-only");
  const inScope = (slug: string) => !scopedGames || scopedGames.has(slug);
  if (!process.env.MONGODB_URI) {
    if (scopedGames) throw new Error("Scoped catalog wave cannot run: MONGODB_URI is not set");
    console.warn("insert-catalog-wave skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const allowedEditions = new Set(scopedGames ? [] : NEW_EDITION_KEYS);
  const allowedMods = new Set(scopedGames ? [] : NEW_MOD_SLUGS);
  const patchGameSlugs = Object.keys(PATCH_GAME_FIELDS).filter(inScope);
  const patchEditionKeys = scopedGames ? [] : Object.keys(PATCH_EDITION_FIELDS);
  const patchModSlugs = scopedGames ? [] : Object.keys(PATCH_MOD_FIELDS);
  const retireEditionKeys = scopedGames ? [] : [...RETIRE_EDITION_KEYS];
  const retireModSlugs = scopedGames ? [] : [...RETIRE_MOD_SLUGS];

  if (
    NEW_GAME_SLUGS.length === 0 &&
    allowedEditions.size === 0 &&
    allowedMods.size === 0 &&
    patchGameSlugs.length === 0 &&
    patchEditionKeys.length === 0 &&
    patchModSlugs.length === 0 &&
    retireEditionKeys.length === 0 &&
    retireModSlugs.length === 0
  ) {
    console.log("insert-catalog-wave: allowlists empty — nothing to do.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  if (featuresOnly) {
    const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
    await dbConnect();
    for (const slug of scopedGames!) {
      const result = await CatalogGame.updateOne(
        { slug },
        { $addToSet: { features: singleFeature! } }
      );
      if (result.matchedCount !== 1) throw new Error(`insert-catalog-wave — feature patch ${slug} matched ${result.matchedCount}, expected 1`);
      console.log(`add feature ${slug}: ${singleFeature}`);
    }
    process.exit(0);
  }
  const Edition = (await import("../src/lib/models/Edition")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const { games } = await import("../src/lib/data/games");
  const { editions } = await import("../src/lib/data/editions");
  const { mods } = await import("../src/lib/data/mods");
  const { developersBySlug } = await import("../src/lib/data/developers");
  const { launcherInstallBySlug } = await import("../src/lib/data/launcherInstall");
  const { correctionsFor } = await import("../src/lib/data/catalogCorrections");
  const { accessAuditModCorrection } = await import("../src/lib/data/accessAuditModCorrections");
  const { dedicatedDraftEditorialFor } = await import("../src/lib/data/dedicatedDraftEditorial");
  const { dedicatedDraftRequirementsFor } = await import("../src/lib/data/dedicatedDraftRequirements");
  const { attributionFor } = await import("../src/lib/data/modAttributions");
  const { modAuthorsBySlug } = await import("../src/lib/data/modAuthors");
  const { defaultArtFor } = await import("../src/lib/gamePayload");
  const { ensureDerivedModFields } = await import("../src/lib/enrich");
  const {
    ASSAULTCUBE_SLUG,
    assaultCubeSystemRequirements,
    assaultCubeHardwareRequirements,
  } = await import("../src/lib/data/assaultCubeSpecs");
  const {
    FREETRAIN_SLUG,
    freetrainEditorial,
    freetrainHardwareRequirements,
    freetrainLauncherInstall,
    freetrainSystemRequirements,
  } = await import("../src/lib/data/freetrainCatalog");
  const { IDLE_SLAYER_SLUG, idleSlayerPatchSource } = await import(
    "../src/lib/data/idleSlayerCatalog"
  );
  const { SEVEN_KINGDOMS_SLUG, sevenKingdomsLauncherInstall } = await import(
    "../src/lib/data/sevenKingdomsCatalog"
  );
  const { HOLOCURE_RICH_PRESENCE_SLUG, holocureRichPresencePatchSource } = await import(
    "../src/lib/data/holocureRichPresenceCatalog"
  );
  const { editorial } = await import("../src/lib/data/editorial");
  const { SKY_CHILDREN_SLUG, skyChildrenPatchSource } = await import(
    "../src/lib/data/skyChildrenCatalog"
  );
  const { SLAPSHOT_REBOUND_SLUG, slapshotReboundPatchSource } = await import(
    "../src/lib/data/slapshotReboundCatalog"
  );
  const { TEEWORLDS_SLUG, teeworldsPatchSource } = await import(
    "../src/lib/data/teeworldsCatalog"
  );
  const { THE_DARK_MOD_SLUG, theDarkModPatchSource } = await import(
    "../src/lib/data/theDarkModCatalog"
  );
  const { UNKNOWN_HORIZONS_SLUG, unknownHorizonsPatchSource } = await import(
    "../src/lib/data/unknownHorizonsCatalog"
  );
  const { SPIKE_CROSS_SLUG, spikeCrossPatchSource } = await import(
    "../src/lib/data/spikeCrossCatalog"
  );
  const { DRAFT_INSTALL_PICKUP } = await import("../src/lib/data/draftInstallPickup");
  const { ALIEN_SWARM_SLUG, alienSwarmPatchSource } = await import(
    "../src/lib/data/alienSwarmCatalog"
  );
  const { SUPER_NOVA_STRIKE_SLUG, superNovaStrikePatchSource } = await import(
    "../src/lib/data/superNovaStrikeCatalog"
  );

  await dbConnect();

  let gamesCreated = 0;
  let gamesSkipped = 0;
  for (const slug of NEW_GAME_SLUGS) {
    if (scopedGames) continue;
    const seed = games.find((g) => g.slug === slug);
    if (!seed) {
      console.warn(`insert-catalog-wave — game ${slug} not in seed, skipping`);
      gamesSkipped++;
      continue;
    }
    const existing = await CatalogGame.findOne({ slug }).select("_id").lean();
    if (existing) {
      gamesSkipped++;
      continue;
    }
    await CatalogGame.create({ ...seed, published: false, status: "draft" });
    console.log(`add game ${slug} (draft)`);
    gamesCreated++;
  }

  const parentSlugs = [
    ...new Set([
      ...NEW_GAME_SLUGS,
      ...NEW_EDITION_KEYS.map((k) => k.split("/")[0]!).filter(Boolean),
      ...patchEditionKeys.map((k) => k.split("/")[0]!).filter(Boolean),
      ...patchGameSlugs,
      ...NEW_MOD_SLUGS.map((slug) => mods.find((m) => m.slug === slug)?.baseGameSlug).filter(
        (s): s is string => Boolean(s)
      ),
    ]),
  ];
  const parents = await CatalogGame.find({ slug: { $in: parentSlugs } })
    .select("_id slug title")
    .lean();
  const gameBySlug = new Map(parents.map((g) => [String(g.slug), g]));

  let editionsCreated = 0;
  let editionsSkipped = 0;
  for (const seed of editions) {
    const key = `${seed.gameSlug}/${seed.slug}`;
    if (!allowedEditions.has(key)) continue;

    const existing = await Edition.findOne({ gameSlug: seed.gameSlug, slug: seed.slug })
      .select("_id")
      .lean();
    if (existing) {
      editionsSkipped++;
      continue;
    }
    const game = gameBySlug.get(seed.gameSlug);
    if (!game) {
      console.warn(`insert-catalog-wave — no parent game for ${key}, skipping`);
      editionsSkipped++;
      continue;
    }
    await Edition.create({
      ...seed,
      isDefault: seed.isDefault === true,
      gameId: game._id,
    });
    console.log(`add edition ${key}`);
    editionsCreated++;
  }

  const baseTitles = new Map(parents.map((g) => [String(g.slug), String(g.title)]));

  let modsCreated = 0;
  let modsSkipped = 0;
  for (const seed of mods) {
    if (!allowedMods.has(seed.slug)) continue;

    const existing = await CatalogMod.findOne({ slug: seed.slug }).select("_id").lean();
    if (existing) {
      modsSkipped++;
      continue;
    }
    const baseSlug =
      seed.baseGameSlug === "keeperfx" ? "dungeon-keeper-gold" : seed.baseGameSlug;
    const baseTitle =
      baseTitles.get(seed.baseGameSlug) || baseTitles.get(baseSlug) || seed.baseGameSlug;
    const m = ensureDerivedModFields(seed, baseTitle);
    await CatalogMod.create({
      slug: m.slug,
      title: m.title,
      tagline: m.tagline,
      description: m.description,
      baseGameSlug: m.baseGameSlug,
      developerSlug: m.developerSlug,
      developerName: developersBySlug.get(m.developerSlug)?.name ?? modAuthorsBySlug.get(m.developerSlug)?.name ?? null,
      license: m.license,
      releaseYear: m.releaseYear,
      sizeMB: m.sizeMB,
      website: m.website,
      githubRepo: m.githubRepo ?? null,
      downloadKind: m.downloadKind,
      assetPattern: m.assetPattern ?? null,
      directUrl: m.directUrl ?? null,
      installerFile: m.installerFile ?? null,
      archiveSha256: m.archiveSha256 ?? null,
      installRelativePath: m.installRelativePath ?? "mods",
      art: m.art ?? defaultArtFor([], m.slug),
      coverImage: m.coverImage ?? null,
      screenshots: m.screenshots ?? [],
      platforms: m.platforms ?? [],
      published: m.published !== false,
      status: m.published !== false ? "published" : "draft",
      managedBy: m.managedBy || "admin",
      longDescription: m.longDescription ?? null,
      whatItChanges: m.whatItChanges ?? null,
      compatibility: m.compatibility ?? null,
      installSteps: m.installSteps ?? [],
      faq: m.faq ?? [],
    });
    console.log(`add mod ${m.slug}`);
    modsCreated++;
  }

  let gamesPatched = 0;
  let gamesPatchSkipped = 0;
  for (const slug of patchGameSlugs) {
    const fields = scopedFields
      ? PATCH_GAME_FIELDS[slug].filter((field) => scopedFields.has(field))
      : PATCH_GAME_FIELDS[slug];
    if (!fields || fields.length === 0) {
      console.warn(`insert-catalog-wave — empty patch field list for ${slug}, skipping`);
      gamesPatchSkipped++;
      continue;
    }

    const existing = await CatalogGame.findOne({ slug }).select("_id").lean();
    if (!existing) {
      console.warn(`insert-catalog-wave — patch game ${slug} not in DB, skipping (no upsert)`);
      gamesPatchSkipped++;
      continue;
    }

    let source: Record<string, unknown>;
    if (slug === FREETRAIN_SLUG) {
      source = {
        ...freetrainEditorial,
        systemRequirements: freetrainSystemRequirements,
        hardwareRequirements: freetrainHardwareRequirements,
        launcherInstall: freetrainLauncherInstall,
      };
    } else if (slug === IDLE_SLAYER_SLUG) {
      source = { ...idleSlayerPatchSource };
    } else if (slug === SKY_CHILDREN_SLUG) {
      source = { ...skyChildrenPatchSource };
    } else if (slug === SLAPSHOT_REBOUND_SLUG) {
      source = { ...slapshotReboundPatchSource };
    } else if (slug === TEEWORLDS_SLUG) {
      source = { ...teeworldsPatchSource };
    } else if (slug === THE_DARK_MOD_SLUG) {
      source = { ...theDarkModPatchSource };
    } else if (slug === UNKNOWN_HORIZONS_SLUG) {
      source = { ...unknownHorizonsPatchSource };
    } else if (slug === SPIKE_CROSS_SLUG) {
      source = { ...spikeCrossPatchSource };
    } else if (slug === ALIEN_SWARM_SLUG) {
      source = { ...alienSwarmPatchSource };
    } else if (slug === SUPER_NOVA_STRIKE_SLUG) {
      source = { ...superNovaStrikePatchSource };
    } else if (slug === SEVEN_KINGDOMS_SLUG) {
      source = { launcherInstall: sevenKingdomsLauncherInstall };
    } else if (slug === "space-station-14") {
      const seed = games.find((g) => g.slug === slug);
      const ed = editorial["space-station-14"];
      const install = seed?.launcherInstall ?? launcherInstallBySlug[slug] ?? null;
      if (!install || !ed?.installSteps) {
        console.warn(`insert-catalog-wave — missing SS14 install/steps source, skipping`);
        gamesPatchSkipped++;
        continue;
      }
      source = {
        launcherInstall: install,
        installSteps: ed.installSteps,
        faq: ed.faq,
        thatOneThing: ed.thatOneThing,
        comparableTo: ed.comparableTo,
      };
    } else if (slug === ASSAULTCUBE_SLUG) {
      const install = launcherInstallBySlug[ASSAULTCUBE_SLUG];
      if (!install) {
        console.warn(`insert-catalog-wave — no launcherInstall for ${slug}, skipping`);
        gamesPatchSkipped++;
        continue;
      }
      source = {
        launcherInstall: install,
        systemRequirements: assaultCubeSystemRequirements,
        hardwareRequirements: assaultCubeHardwareRequirements,
      };
    } else {
      const seed = games.find((g) => g.slug === slug);
      const corrections = correctionsFor(slug) ?? dedicatedDraftEditorialFor(slug);
      /*
       * A game curated entirely in the admin CMS has no seed row, so the wave
       * skipped it and there was no safe way to fix one wrong field. A
       * reviewed correction can now stand on its own; the "missing source"
       * check below still refuses any allowlisted field it does not supply.
       */
      if (!seed && !corrections) {
        console.warn(`insert-catalog-wave — patch game ${slug} not in seed, skipping`);
        gamesPatchSkipped++;
        continue;
      }
      const ed = editorial[slug];
      if (seed) {
        const install = seed.launcherInstall ?? launcherInstallBySlug[slug] ?? null;
        // Always merge editorial.ts — do not rely solely on withEditorial on the
        // games export. Patch allowlists often name longDescription / faq / etc.
        source = {
          ...(seed as unknown as Record<string, unknown>),
          ...((ed ?? {}) as unknown as Record<string, unknown>),
          launcherInstall: install,
        };
      } else {
        // No seed: editorial plus the correction overlay below is the whole
        // source. launcherInstall is deliberately not synthesised here —
        // patching a live install recipe from a file that never described one
        // is how you break an install.
        source = { ...((ed ?? {}) as unknown as Record<string, unknown>) };
      }
    }

    /*
     * Reviewed corrections win over every source above, including the
     * hand-written per-slug blocks. teeworlds and space-station-14 both have
     * their own source objects describing install and hardware only, so a
     * releaseYear fix for them had nowhere to come from until this overlay.
     */
    const slugCorrections = correctionsFor(slug);
    if (slugCorrections) {
      source = { ...source, ...slugCorrections };
    }
    const draftEditorial = dedicatedDraftEditorialFor(slug);
    if (draftEditorial) source = { ...source, ...draftEditorial };
    const draftRequirements = dedicatedDraftRequirementsFor(slug);
    if (draftRequirements) source = { ...source, ...draftRequirements };

    const payload = pickFields(source, fields);
    for (const field of fields) {
      if (payload[field] === undefined) {
        throw new Error(
          `insert-catalog-wave — refuse patch ${slug}: missing source for field "${field}"`
        );
      }
    }

    if (payload.status) {
      payload.published = payload.status === "published";
      if (payload.status === "published") {
        payload.publishedAt = new Date();
      }
    }

    if (slug === "castlevania-revamped") {
      delete payload.coverImage;
    }

    const additions = scopedFields ? [] : (ADD_GAME_FEATURES[slug] ?? []);
    if (additions.length && fields.includes("features")) {
      throw new Error(`insert-catalog-wave — refuse conflicting feature writes for ${slug}`);
    }
    const update = additions.length
      ? { $set: payload, $addToSet: { features: { $each: [...additions] } } }
      : { $set: payload };
    const result = await CatalogGame.updateOne({ slug }, update);
    if (result.matchedCount !== 1) {
      if (result.matchedCount === 0 && SKIP_MISSING_PATCH_GAMES.includes(slug)) {
        console.warn(`insert-catalog-wave — ${slug} draft not renamed yet, skipping`);
        gamesPatchSkipped++;
        continue;
      }
      throw new Error(
        `insert-catalog-wave — patch ${slug} matched ${result.matchedCount}, expected 1`
      );
    }
    console.log(`patch game ${slug} fields=[${fields.join(", ")}]`);
    gamesPatched++;
  }

  // Steam is a launch handoff, not a download recipe. Do not replace a
  // curator's existing recipe (including an intentionally disabled one).
  // Exception: the imported Risk of Rain 2 draft may still carry Alloyed
  // Collective's DLC app id after its slug/title are corrected. Replace only
  // that exact, provably wrong handoff; never touch another store's recipe.
  const correctedDlc = scopedGames ? { modifiedCount: 0 } : await CatalogGame.updateOne(
    { slug: "risk-of-rain-2", status: "draft", $or: [
      { "launcherInstall.steamAppId": "2781620" },
      { "launcherInstall.url": "steam://run/2781620" },
    ] },
    { $set: {
      "launcherInstall.enabled": true,
      "launcherInstall.kind": "external",
      "launcherInstall.url": "steam://run/632360",
      "launcherInstall.steamAppId": "632360",
      "launcherInstall.exeHint": "Risk of Rain 2.exe",
    } }
  );
  if (correctedDlc.modifiedCount) console.log("replace Risk of Rain 2 DLC Steam handoff with base game");
  for (const [slug, appId] of Object.entries(FILL_MISSING_STEAM_LAUNCH)) {
    if (scopedGames) continue;
    const result = await CatalogGame.updateOne(
      { slug, status: "draft", $or: [{ launcherInstall: null }, { launcherInstall: { $exists: false } }] },
      { $set: { launcherInstall: {
        enabled: true,
        kind: "external",
        url: `steam://run/${appId}`,
        steamAppId: appId,
        ...(STEAM_CLIENT_EXE_HINTS[slug] ? { exeHint: STEAM_CLIENT_EXE_HINTS[slug] } : {}),
        note: "Steam installs and launches this game. Each player needs their own copy where required.",
      } } }
    );
    if (result.modifiedCount) console.log(`fill missing Steam launch ${slug}`);
  }

  // Database-only paid games: a store hands off the acquisition; PlayBound
  // discovers the owned executable afterwards. Patch only detection subfields
  // so an admin's install method, download URL, and other recipe settings stay
  // authoritative. Anthology's existing verified VPS package is preserved;
  // there is no storefront handoff to synthesize if that recipe is absent.
  for (const [slug, pickup] of Object.entries(DRAFT_INSTALL_PICKUP)) {
    if (scopedGames) continue;
    const doc = await CatalogGame.findOne({ slug }).select("launcherInstall").lean();
    if (!doc) continue;
    const existing = doc.launcherInstall;
    if (!existing) {
      if (pickup.acquisitionAvailable === false) continue;
      const result = await CatalogGame.updateOne(
        { slug, $or: [{ launcherInstall: null }, { launcherInstall: { $exists: false } }] },
        { $set: { launcherInstall: {
          enabled: true,
          kind: "external",
          url: pickup.storeUrl,
          exeHint: pickup.exeHint,
          knownExePaths: pickup.knownExePaths,
          registryTitles: pickup.registryTitles ?? [],
          note: "Get and install your own copy from the official store. PlayBound detects its executable afterwards.",
        } }, $addToSet: { launchMethods: "install" } }
      );
      if (result.modifiedCount) console.log(`add store handoff and pickup for ${slug}`);
      continue;
    }

    const knownExePaths = Array.isArray(existing.knownExePaths)
      ? existing.knownExePaths.filter((path: unknown): path is string => typeof path === "string")
      : [];
    const registryTitles = Array.isArray(existing.registryTitles)
      ? existing.registryTitles.filter((title: unknown): title is string => typeof title === "string")
      : [];
    const detection: Record<string, unknown> = {
      "launcherInstall.knownExePaths": [...new Set([...knownExePaths, ...pickup.knownExePaths])],
      "launcherInstall.registryTitles": [...new Set([...registryTitles, ...(pickup.registryTitles ?? [])])],
    };
    if (slug === "battlefield-1942-anthology" &&
        existing.kind === "direct-zip" &&
        /^https:\/\/mirror\.playbound\.club\/launcher-packages\/games\/battlefield-1942-the-complete-collection\/[^/]+\.zip$/i.test(String(existing.url || ""))) {
      detection["launcherInstall.archiveInstallerName"] = "bf1942-setup.exe";
    }
    if (pickup.acquisitionAvailable !== false && !existing.enabled) {
      detection["launcherInstall.enabled"] = true;
    }
    if (!existing.exeHint || existing.exeHint === STEAM_CLIENT_EXE_HINTS[slug] || slug === "dont-starve-together") {
      detection["launcherInstall.exeHint"] = pickup.exeHint;
    }
    const oldUrl = String(existing.url || "");
    if (existing.kind === "external" && (
      !oldUrl ||
      (pickup.replaceSteamUrl && oldUrl === pickup.replaceSteamUrl) ||
      (slug === "vintage-story" && /^https?:\/\/(?:www\.)?(?:vintagestory\.at|account\.vintagestory\.at)(?:\/|$)/i.test(oldUrl))
    )) {
      detection["launcherInstall.url"] = pickup.storeUrl;
      if (pickup.replaceSteamUrl && oldUrl === pickup.replaceSteamUrl) {
        detection["launcherInstall.note"] = "Get your own copy from GOG; PlayBound detects the GOG or Steam installation afterwards.";
      }
    }
    const result = await CatalogGame.updateOne(
      { slug, "launcherInstall.kind": existing.kind },
      { $set: detection, ...(pickup.acquisitionAvailable === false ? {} : { $addToSet: { launchMethods: "install" } }) }
    );
    if (result.modifiedCount) console.log(`patch owned-game pickup for ${slug}`);
  }
  // These two storefront links were supplied by the curator. Keep the game's
  // existing offers/prices untouched; the normal GOG matcher can price them.
  for (const slug of ["stardew-valley", "starbound"] as const) {
    if (scopedGames) continue;
    await CatalogGame.updateOne(
      { slug, $or: [{ gogStoreUrl: null }, { gogStoreUrl: { $exists: false } }] },
      { $set: { gogStoreUrl: DRAFT_INSTALL_PICKUP[slug].storeUrl } }
    );
  }

  let editionsPatched = 0;
  let editionsPatchSkipped = 0;
  for (const key of patchEditionKeys) {
    const fields = PATCH_EDITION_FIELDS[key];
    if (!fields || fields.length === 0) {
      console.warn(`insert-catalog-wave — empty patch field list for ${key}, skipping`);
      editionsPatchSkipped++;
      continue;
    }
    const [gameSlug, editionSlug] = key.split("/");
    if (!gameSlug || !editionSlug) {
      console.warn(`insert-catalog-wave — bad edition key ${key}, skipping`);
      editionsPatchSkipped++;
      continue;
    }

    const seed = editions.find((e) => e.gameSlug === gameSlug && e.slug === editionSlug);
    if (!seed) {
      console.warn(`insert-catalog-wave — patch edition ${key} not in seed, skipping`);
      editionsPatchSkipped++;
      continue;
    }

    const existing = await Edition.findOne({ gameSlug, slug: editionSlug }).select("_id").lean();
    if (!existing) {
      console.warn(`insert-catalog-wave — patch edition ${key} not in DB, skipping (no upsert)`);
      editionsPatchSkipped++;
      continue;
    }

    const source: Record<string, unknown> = {
      name: seed.name,
      description: seed.description,
      version: seed.version,
      installConfig: seed.installConfig,
      shortDescription: seed.shortDescription,
      visibility: seed.visibility,
      status: seed.status,
      installMethod: seed.installMethod,
      requirements: seed.requirements,
      hardwareRequirements: seed.hardwareRequirements,
      aliases: seed.aliases,
      links: seed.links,
      features: seed.features,
      tags: seed.tags,
      multiplayerGamingSteps: seed.multiplayerGamingSteps,
      faq: seed.faq,
      verificationNote: seed.verificationNote,
    };
    const payload = pickFields(source, fields);
    for (const field of fields) {
      if (payload[field] === undefined) {
        throw new Error(
          `insert-catalog-wave — refuse patch ${key}: missing source for field "${field}"`
        );
      }
    }

    const result = await Edition.updateOne({ gameSlug, slug: editionSlug }, { $set: payload });
    if (result.matchedCount !== 1) {
      throw new Error(
        `insert-catalog-wave — patch ${key} matched ${result.matchedCount}, expected 1`
      );
    }
    console.log(`patch edition ${key} fields=[${fields.join(", ")}]`);
    editionsPatched++;
  }

  let editionsRetired = 0;
  let editionsRetireSkipped = 0;
  for (const key of retireEditionKeys) {
    const [gameSlug, editionSlug] = key.split("/");
    if (!gameSlug || !editionSlug) {
      console.warn(`insert-catalog-wave — bad retire edition key ${key}, skipping`);
      editionsRetireSkipped++;
      continue;
    }
    const existing = await Edition.findOne({ gameSlug, slug: editionSlug }).select("_id").lean();
    if (!existing) {
      console.warn(`insert-catalog-wave — retire edition ${key} not in DB, skipping (no upsert)`);
      editionsRetireSkipped++;
      continue;
    }
    const result = await Edition.updateOne(
      { gameSlug, slug: editionSlug },
      { $set: { visibility: "hidden", status: "archived" } }
    );
    if (result.matchedCount !== 1) {
      throw new Error(
        `insert-catalog-wave — retire ${key} matched ${result.matchedCount}, expected 1`
      );
    }
    console.log(`retire edition ${key} visibility=hidden status=archived`);
    editionsRetired++;
  }

  let modsPatched = 0;
  let modsPatchSkipped = 0;
  for (const slug of patchModSlugs) {
    const fields = PATCH_MOD_FIELDS[slug];
    if (!fields || fields.length === 0) {
      console.warn(`insert-catalog-wave — empty patch field list for mod ${slug}, skipping`);
      modsPatchSkipped++;
      continue;
    }

    const existing = await CatalogMod.findOne({ slug }).select("_id").lean();
    if (!existing) {
      console.warn(`insert-catalog-wave — patch mod ${slug} not in DB, skipping (no upsert)`);
      modsPatchSkipped++;
      continue;
    }

    let source: Record<string, unknown>;
    if (slug === HOLOCURE_RICH_PRESENCE_SLUG) {
      source = { ...holocureRichPresencePatchSource };
    } else {
      /*
       * Default mod patch source: the seed row, with corrected attribution
       * layered on top.
       *
       * There was no default path here at all, so every mod except HoloCure
       * was skipped with "no patch source" — which meant the wave could
       * create and retire mods but never fix one. developerName is resolved
       * the same way the game path does it, looking through game studios
       * first and then mod authors, so a mod credited to a person and a mod
       * credited to a studio both end up with a real name rather than null.
       */
      const seedMod = mods.find((m) => m.slug === slug);
      if (!seedMod && !attributionFor(slug)) {
        console.warn(`insert-catalog-wave — no patch source for mod ${slug}, skipping`);
        modsPatchSkipped++;
        continue;
      }
      source = { ...((seedMod ?? {}) as unknown as Record<string, unknown>) };
    }

    /*
     * Corrected attribution overlays every source, including the hand-written
     * per-mod blocks — holocure-rich-presence has one and also needs its
     * credit fixed, and without this the allowlist could name a field that
     * branch never supplies. developerName is resolved through game studios
     * first and then mod authors, so both kinds of credit end up with a real
     * name instead of null.
     */
    const attributed = attributionFor(slug);
    if (attributed) {
      source = {
        ...source,
        developerSlug: attributed,
        developerName:
          developersBySlug.get(attributed)?.name ??
          modAuthorsBySlug.get(attributed)?.name ??
          null,
      };
    }
    // This legacy "Loot filter hubs" row is an external link with no live
    // Diablo II parent. Archive the one orphan without deleting its record.
    source = { ...source, ...accessAuditModCorrection(slug) };

    const payload = pickFields(source, fields);
    for (const field of fields) {
      if (payload[field] === undefined) {
        throw new Error(
          `insert-catalog-wave — refuse patch mod ${slug}: missing source for field "${field}"`
        );
      }
    }

    const result = await CatalogMod.updateOne({ slug }, { $set: payload });
    if (result.matchedCount !== 1) {
      throw new Error(
        `insert-catalog-wave — patch mod ${slug} matched ${result.matchedCount}, expected 1`
      );
    }
    console.log(`patch mod ${slug} fields=[${fields.join(", ")}]`);
    modsPatched++;
  }

  const { partyMaxPlayersBySlug } = await import("../src/lib/data/partyMaxPlayers");
  let maxPlayersPatched = 0;
  for (const [slug, maxPlayers] of Object.entries(partyMaxPlayersBySlug)) {
    if (scopedGames) continue;
    const result = await CatalogGame.updateOne({ slug }, { $set: { maxPlayers } });
    if (result.matchedCount === 1) {
      maxPlayersPatched++;
      console.log(`patch game ${slug} fields=[maxPlayers]=${maxPlayers}`);
    }
  }

  // 6. Soft-retire allowlisted non-mod slugs. Never delete catalog records.
  let modsRetired = 0;
  if (retireModSlugs.length > 0) {
    const res = await CatalogMod.updateMany(
      { slug: { $in: retireModSlugs }, status: { $ne: "archived" } },
      { $set: { published: false, status: "archived" } }
    );
    modsRetired = res.modifiedCount ?? 0;
    if (modsRetired > 0) {
      console.log(`retired ${modsRetired} non-mod catalog mod(s)`);
    }
  }

  console.log(
    `insert-catalog-wave: games +${gamesCreated}/skip ${gamesSkipped}, ` +
      `editions +${editionsCreated}/skip ${editionsSkipped}, ` +
      `mods +${modsCreated}/skip ${modsSkipped}, ` +
      `game-patches ${gamesPatched}/skip ${gamesPatchSkipped}, ` +
      `edition-patches ${editionsPatched}/skip ${editionsPatchSkipped}, ` +
      `editions-retired ${editionsRetired}/skip ${editionsRetireSkipped}, ` +
      `mod-patches ${modsPatched}/skip ${modsPatchSkipped}, ` +
      `mods-retired ${modsRetired}, ` +
      `maxPlayers ${maxPlayersPatched}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("insert-catalog-wave failed:", err);
  process.exit(1);
});
