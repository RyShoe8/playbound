/**
 * Catalog wave — applied by `.github/workflows/apply-catalog-wave.yml`
 * (`npm run insert:catalog-wave` / `postdeploy:catalog`). Not part of `build`.
 *
 * Contract:
 *   - explicit allowlists only (never the whole seed catalog)
 *   - inserts: create only when absent; new games are draft / unpublished
 *   - patches: $set ONLY allowlisted fields on existing named docs
 *   - retire editions: $set visibility=hidden + status=archived only
 *   - never deletes rows, never upserts patches, never publishes a parent game
 *   - never writes a slug that is not on an allowlist
 *
 * Allowlists live in `insert-catalog-wave.allowlist.ts`.
 */
import { loadEnvConfig } from "@next/env";
import {
  NEW_EDITION_KEYS,
  NEW_GAME_SLUGS,
  NEW_MOD_SLUGS,
  PATCH_EDITION_FIELDS,
  PATCH_GAME_FIELDS,
  PATCH_MOD_FIELDS,
  RETIRE_EDITION_KEYS,
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
  if (!process.env.MONGODB_URI) {
    console.warn("insert-catalog-wave skipped — MONGODB_URI is not set.");
    process.exit(0);
  }

  const allowedEditions = new Set(NEW_EDITION_KEYS);
  const allowedMods = new Set(NEW_MOD_SLUGS);
  const patchGameSlugs = Object.keys(PATCH_GAME_FIELDS);
  const patchEditionKeys = Object.keys(PATCH_EDITION_FIELDS);
  const patchModSlugs = Object.keys(PATCH_MOD_FIELDS);
  const retireEditionKeys = [...RETIRE_EDITION_KEYS];

  if (
    NEW_GAME_SLUGS.length === 0 &&
    allowedEditions.size === 0 &&
    allowedMods.size === 0 &&
    patchGameSlugs.length === 0 &&
    patchEditionKeys.length === 0 &&
    patchModSlugs.length === 0 &&
    retireEditionKeys.length === 0
  ) {
    console.log("insert-catalog-wave: allowlists empty — nothing to do.");
    process.exit(0);
  }

  const dbConnect = (await import("../src/lib/db")).default;
  const Edition = (await import("../src/lib/models/Edition")).default;
  const CatalogGame = (await import("../src/lib/models/CatalogGame")).default;
  const CatalogMod = (await import("../src/lib/models/CatalogMod")).default;
  const { games } = await import("../src/lib/data/games");
  const { editions } = await import("../src/lib/data/editions");
  const { mods } = await import("../src/lib/data/mods");
  const { developersBySlug } = await import("../src/lib/data/developers");
  const { launcherInstallBySlug } = await import("../src/lib/data/launcherInstall");
  const { correctionsFor } = await import("../src/lib/data/catalogCorrections");
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
      developerName: developersBySlug.get(m.developerSlug)?.name ?? null,
      license: m.license,
      releaseYear: m.releaseYear,
      sizeMB: m.sizeMB,
      website: m.website,
      githubRepo: m.githubRepo ?? null,
      downloadKind: m.downloadKind,
      assetPattern: m.assetPattern ?? null,
      directUrl: m.directUrl ?? null,
      installRelativePath: m.installRelativePath ?? "mods",
      art: m.art ?? defaultArtFor([], m.slug),
      coverImage: m.coverImage ?? null,
      screenshots: m.screenshots ?? [],
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
    const fields = PATCH_GAME_FIELDS[slug];
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
      const corrections = correctionsFor(slug);
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

    const result = await CatalogGame.updateOne({ slug }, { $set: payload });
    if (result.matchedCount !== 1) {
      throw new Error(
        `insert-catalog-wave — patch ${slug} matched ${result.matchedCount}, expected 1`
      );
    }
    console.log(`patch game ${slug} fields=[${fields.join(", ")}]`);
    gamesPatched++;
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
    const result = await CatalogGame.updateOne({ slug }, { $set: { maxPlayers } });
    if (result.matchedCount === 1) {
      maxPlayersPatched++;
      console.log(`patch game ${slug} fields=[maxPlayers]=${maxPlayers}`);
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
      `maxPlayers ${maxPlayersPatched}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("insert-catalog-wave failed:", err);
  process.exit(1);
});
