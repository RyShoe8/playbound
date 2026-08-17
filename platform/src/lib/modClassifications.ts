import dbConnect from "@/lib/db";
import ModClassification, { type IModClassification } from "@/lib/models/ModClassification";
import CatalogMod from "@/lib/models/CatalogMod";
import { Types } from "mongoose";

export type ModClassificationNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  modCount: number;
  depth: number;
  path: string;
  children: ModClassificationNode[];
};

export type ModClassificationFlat = Omit<ModClassificationNode, "children"> & {
  parentName?: string | null;
};

export type ClassificationInput = {
  name: string;
  slug?: string;
  description?: string | null;
  parentId?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export function slugifyClassification(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Fetch all classifications from MongoDB in a single query and assemble both
 * a nested hierarchical tree and an enriched flat list.
 */
export async function getModClassificationTree(
  includeInactive = true
): Promise<{ tree: ModClassificationNode[]; flat: ModClassificationFlat[] }> {
  await dbConnect();

  const filter = includeInactive ? {} : { isActive: true };
  const docs = await ModClassification.find(filter)
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  // Aggregate count of published/active mods using each classification
  const modCountMap = new Map<string, number>();
  try {
    const agg = await CatalogMod.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $unwind: "$classificationIds" },
      { $group: { _id: "$classificationIds", count: { $sum: 1 } } },
    ]);
    for (const item of agg) {
      if (item._id) modCountMap.set(String(item._id), item.count);
    }
  } catch {
    /* ignore */
  }

  const rawMap = new Map<string, (typeof docs)[0]>();
  for (const doc of docs) {
    rawMap.set(String(doc._id), doc);
  }

  // Group by parentId
  const childrenMap = new Map<string | "root", (typeof docs)[0][]>();
  for (const doc of docs) {
    const pKey = doc.parentId ? String(doc.parentId) : "root";
    if (!childrenMap.has(pKey)) childrenMap.set(pKey, []);
    childrenMap.get(pKey)!.push(doc);
  }

  const flat: ModClassificationFlat[] = [];

  function buildSubtree(
    parentId: string | "root",
    depth = 0,
    parentPath = ""
  ): ModClassificationNode[] {
    const children = childrenMap.get(parentId) || [];
    const nodes: ModClassificationNode[] = [];

    for (const child of children) {
      const id = String(child._id);
      const path = parentPath ? `${parentPath} → ${child.name}` : child.name;
      const modCount = modCountMap.get(id) || 0;
      const parentName = child.parentId ? rawMap.get(String(child.parentId))?.name || null : null;

      const subChildren = buildSubtree(id, depth + 1, path);

      const node: ModClassificationNode = {
        id,
        name: child.name,
        slug: child.slug,
        description: child.description || null,
        parentId: child.parentId ? String(child.parentId) : null,
        icon: child.icon || null,
        sortOrder: typeof child.sortOrder === "number" ? child.sortOrder : 0,
        isActive: child.isActive !== false,
        createdAt: child.createdAt ? new Date(child.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: child.updatedAt ? new Date(child.updatedAt).toISOString() : new Date().toISOString(),
        modCount,
        depth,
        path,
        children: subChildren,
      };

      flat.push({
        id: node.id,
        name: node.name,
        slug: node.slug,
        description: node.description,
        parentId: node.parentId,
        parentName,
        icon: node.icon,
        sortOrder: node.sortOrder,
        isActive: node.isActive,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        modCount: node.modCount,
        depth: node.depth,
        path: node.path,
      });

      nodes.push(node);
    }

    return nodes;
  }

  const tree = buildSubtree("root", 0, "");
  return { tree, flat };
}

/**
 * Returns a single classification document by ID or slug.
 */
export async function getModClassification(idOrSlug: string) {
  await dbConnect();
  if (Types.ObjectId.isValid(idOrSlug)) {
    return ModClassification.findById(idOrSlug).lean();
  }
  return ModClassification.findOne({ slug: idOrSlug }).lean();
}

/**
 * Create a new classification with validation.
 */
export async function createModClassification(input: ClassificationInput) {
  await dbConnect();

  const name = input.name.trim();
  if (!name) throw new Error("Classification name is required.");

  let slug = input.slug ? slugifyClassification(input.slug) : slugifyClassification(name);
  if (!slug) slug = `classification-${Date.now()}`;

  const clash = await ModClassification.findOne({ slug }).lean();
  if (clash) {
    throw new Error(`A classification with slug "${slug}" already exists.`);
  }

  let parentId: Types.ObjectId | null = null;
  if (input.parentId && input.parentId.trim()) {
    if (!Types.ObjectId.isValid(input.parentId)) {
      throw new Error("Invalid parent classification ID.");
    }
    const parent = await ModClassification.findById(input.parentId).lean();
    if (!parent) {
      throw new Error("Parent classification not found.");
    }
    parentId = new Types.ObjectId(input.parentId);
  }

  const doc = await ModClassification.create({
    name,
    slug,
    description: input.description?.trim() || null,
    parentId,
    icon: input.icon?.trim() || null,
    sortOrder: typeof input.sortOrder === "number" ? input.sortOrder : 0,
    isActive: input.isActive !== false,
  });

  return doc.toObject();
}

/**
 * Update an existing classification, preventing circular ancestry loops.
 */
export async function updateModClassification(id: string, input: Partial<ClassificationInput>) {
  await dbConnect();

  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid classification ID.");
  }

  const existing = await ModClassification.findById(id);
  if (!existing) {
    throw new Error("Classification not found.");
  }

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Classification name cannot be empty.");
    existing.name = name;
  }

  if (input.slug !== undefined) {
    const slug = slugifyClassification(input.slug);
    if (!slug) throw new Error("Slug cannot be empty.");
    if (slug !== existing.slug) {
      const clash = await ModClassification.findOne({ slug, _id: { $ne: existing._id } }).lean();
      if (clash) {
        throw new Error(`A classification with slug "${slug}" already exists.`);
      }
      existing.slug = slug;
    }
  }

  if (input.description !== undefined) {
    existing.description = input.description?.trim() || null;
  }

  if (input.icon !== undefined) {
    existing.icon = input.icon?.trim() || null;
  }

  if (input.sortOrder !== undefined) {
    existing.sortOrder = typeof input.sortOrder === "number" ? input.sortOrder : 0;
  }

  if (input.isActive !== undefined) {
    existing.isActive = Boolean(input.isActive);
  }

  // Handle parent change with circular hierarchy prevention
  if (input.parentId !== undefined) {
    if (!input.parentId || input.parentId === "null" || input.parentId === "") {
      existing.parentId = null;
    } else {
      if (!Types.ObjectId.isValid(input.parentId)) {
        throw new Error("Invalid parent classification ID.");
      }
      if (input.parentId === id) {
        throw new Error("A classification cannot be its own parent.");
      }

      // Check if the target parent is a descendant of this node (would create a cycle)
      const isDescendant = await checkIsDescendant(id, input.parentId);
      if (isDescendant) {
        throw new Error("Cannot move classification under one of its own sub-classifications.");
      }

      const parentDoc = await ModClassification.findById(input.parentId).lean();
      if (!parentDoc) {
        throw new Error("Target parent classification not found.");
      }
      existing.parentId = new Types.ObjectId(input.parentId);
    }
  }

  await existing.save();
  return existing.toObject();
}

/**
 * Checks if targetId is a descendant of rootId.
 */
async function checkIsDescendant(rootId: string, targetId: string): Promise<boolean> {
  let currentId: string | null = targetId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === rootId) return true;
    if (visited.has(currentId)) return false;
    visited.add(currentId);

    const doc: { parentId?: Types.ObjectId | null } | null =
      await ModClassification.findById(currentId, { parentId: 1 }).lean();
    if (!doc || !doc.parentId) break;
    currentId = String(doc.parentId);
  }

  return false;
}

/**
 * Delete a classification.
 * - Fails if the classification has child classifications.
 * - Automatically unassigns this classification from any mods that reference it.
 */
export async function deleteModClassification(id: string) {
  await dbConnect();

  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid classification ID.");
  }

  const childCount = await ModClassification.countDocuments({ parentId: id });
  if (childCount > 0) {
    throw new Error(
      `Cannot delete this classification because it contains ${childCount} sub-classification(s). Please delete or reassign child classifications first.`
    );
  }

  // Automatically remove this classification from all mods that currently have it
  const updateResult = await CatalogMod.updateMany(
    { classificationIds: new Types.ObjectId(id) },
    { $pull: { classificationIds: new Types.ObjectId(id) } }
  );

  const deleted = await ModClassification.findByIdAndDelete(id);
  if (!deleted) {
    throw new Error("Classification not found.");
  }

  return {
    success: true,
    deletedId: id,
    modsUpdated: updateResult.modifiedCount || 0,
  };
}

/**
 * Given a classification ID or slug, collects all descendant classification IDs
 * (including self) to support hierarchical mod filtering.
 */
export async function getDescendantClassificationIds(idOrSlug: string): Promise<Types.ObjectId[]> {
  await dbConnect();

  let targetId: Types.ObjectId | null = null;
  if (Types.ObjectId.isValid(idOrSlug)) {
    targetId = new Types.ObjectId(idOrSlug);
  } else {
    const doc = await ModClassification.findOne({ slug: idOrSlug }, { _id: 1 }).lean();
    if (doc?._id) targetId = doc._id as Types.ObjectId;
  }

  if (!targetId) return [];

  const allDocs = await ModClassification.find({}, { _id: 1, parentId: 1 }).lean();
  const childrenMap = new Map<string, Types.ObjectId[]>();

  for (const doc of allDocs) {
    if (doc.parentId) {
      const pKey = String(doc.parentId);
      if (!childrenMap.has(pKey)) childrenMap.set(pKey, []);
      childrenMap.get(pKey)!.push(doc._id as Types.ObjectId);
    }
  }

  const result: Types.ObjectId[] = [];
  const queue = [targetId];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    result.push(curr);
    const children = childrenMap.get(String(curr)) || [];
    for (const ch of children) queue.push(ch);
  }

  return result;
}

export type ModClassificationTag = {
  id: string;
  name: string;
  slug: string;
  path: string;
  leaf: string;
  icon?: string | null;
};

/**
 * Resolves full ancestry breadcrumbs and leaf tags for a list of classification IDs.
 */
export async function getModClassificationsWithAncestry(
  classificationIds: (string | Types.ObjectId)[]
): Promise<ModClassificationTag[]> {
  if (!classificationIds || classificationIds.length === 0) return [];
  await dbConnect();

  const objectIds = classificationIds
    .map((id) => (Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null))
    .filter(Boolean) as Types.ObjectId[];

  if (objectIds.length === 0) return [];

  const allClassifications = await ModClassification.find({ isActive: true }).lean();
  const byId = new Map<string, (typeof allClassifications)[0]>();
  for (const c of allClassifications) {
    byId.set(String(c._id), c);
  }

  const tags: ModClassificationTag[] = [];

  for (const id of objectIds) {
    const idStr = String(id);
    const current = byId.get(idStr);
    if (!current) continue;

    // Trace breadcrumb path
    const breadcrumbNames: string[] = [current.name];
    let parentId = current.parentId ? String(current.parentId) : null;
    const visited = new Set<string>([idStr]);

    while (parentId && byId.has(parentId)) {
      if (visited.has(parentId)) break;
      visited.add(parentId);
      const parent = byId.get(parentId)!;
      breadcrumbNames.unshift(parent.name);
      parentId = parent.parentId ? String(parent.parentId) : null;
    }

    tags.push({
      id: idStr,
      name: current.name,
      slug: current.slug,
      path: breadcrumbNames.join(" → "),
      leaf: current.name,
      icon: current.icon || null,
    });
  }

  return tags;
}

/**
 * Initial taxonomy seed structure matching Requirement 6.
 */
export const INITIAL_TAXONOMY_SEED: Array<{
  name: string;
  description?: string;
  children?: Array<{
    name: string;
    description?: string;
    children?: Array<{
      name: string;
      description?: string;
    }>;
  }>;
}> = [
  { name: "Content", description: "Expansions, content packs, and general add-ons" },
  {
    name: "Gameplay",
    description: "Mechanics, balance, progression, and rule modifications",
    children: [
      { name: "Gameplay Overhaul", description: "Complete restructuring of core gameplay loops" },
      { name: "Balance", description: "Combat, economy, or stat adjustments" },
      { name: "Difficulty", description: "Survival, hardcore, or custom difficulty settings" },
      { name: "Progression", description: "Skill trees, leveling, and quest adjustments" },
      { name: "Mechanics", description: "New game systems, movement, or physics" },
    ],
  },
  {
    name: "Vehicle",
    description: "Land, air, sea, and specialized transport vehicles",
    children: [
      {
        name: "Aircraft",
        description: "Planes, jets, helicopters, and airborne craft",
        children: [
          { name: "Fighter", description: "Combat and dogfighting aircraft" },
          { name: "Bomber", description: "Heavy bombing and assault craft" },
          { name: "Helicopter", description: "Rotary-wing aircraft and gunships" },
          { name: "Transport", description: "Cargo and troop transport planes" },
        ],
      },
      { name: "Car", description: "Passenger cars, sports cars, and road vehicles" },
      { name: "Motorcycle", description: "Bikes, choppers, and two-wheeled vehicles" },
      { name: "Tank", description: "Armored fighting vehicles and tracked armor" },
      { name: "Ship", description: "Naval warships and sea vessels" },
      { name: "Boat", description: "Small boats, patrol craft, and watercraft" },
      { name: "Train", description: "Locomotives, railcars, and railway transit" },
    ],
  },
  {
    name: "Character",
    description: "Player models, skins, companions, and NPCs",
    children: [
      { name: "Character Skin", description: "Alternate textures and costumes" },
      { name: "NPC", description: "Non-player characters and AI actors" },
      { name: "Companion", description: "Followers, pets, and squadmates" },
    ],
  },
  {
    name: "Weapon",
    description: "Firearms, melee weapons, and weapon packs",
    children: [
      { name: "Weapon Pack", description: "Collections of multiple weapons" },
      { name: "Weapon Skin", description: "Camos, finishes, and visual weapon reskins" },
    ],
  },
  {
    name: "Map",
    description: "Levels, battlegrounds, and environments",
    children: [
      { name: "Multiplayer Map", description: "Arenas and competitive multiplayer layouts" },
      { name: "Single Player Map", description: "Standalone challenge and sandbox maps" },
      { name: "Campaign Map", description: "Story-driven campaign missions" },
    ],
  },
  {
    name: "Graphics",
    description: "Visual enhancements, textures, models, and shaders",
    children: [
      { name: "Textures", description: "High-resolution textures and material packs" },
      { name: "Models", description: "3D meshes, props, and world geometry" },
      { name: "Lighting", description: "Volumetric lighting, day/night cycles, and bloom" },
      { name: "Shaders", description: "Post-processing, water, and shader presets" },
      { name: "Visual Overhaul", description: "Comprehensive graphics modernization" },
      { name: "Effects", description: "Particles, explosions, smoke, and FX" },
    ],
  },
  {
    name: "Audio",
    description: "Music, soundtracks, sound effects, and voice lines",
    children: [
      { name: "Music", description: "Original soundtracks, battle themes, and radio stations" },
      { name: "Sound Effects", description: "Gunfire, engine sounds, and environmental audio" },
      { name: "Voice", description: "Voice acting, voiceovers, and character callouts" },
      { name: "Ambient", description: "Background ambience, weather, and world audio" },
    ],
  },
  {
    name: "UI",
    description: "HUDs, menus, inventories, and interface tweaks",
    children: [
      { name: "HUD", description: "Heads-up displays, crosshairs, and status gauges" },
      { name: "Menu", description: "Start menus, settings screens, and pause layouts" },
      { name: "Interface", description: "Inventory grids, font scaling, and quality-of-life UI" },
    ],
  },
  { name: "Campaign", description: "Story missions, campaigns, and scenarios" },
  {
    name: "Multiplayer",
    description: "Online multiplayer, co-op, networking, and dedicated servers",
    children: [
      { name: "Co-op", description: "Cooperative multiplayer modes and campaigns" },
      { name: "Competitive", description: "Ranked ladders, esports modes, and tournaments" },
      { name: "Networking", description: "Netcode improvements and low-latency sync" },
      { name: "Server", description: "Dedicated server tools and administration plugins" },
    ],
  },
  { name: "Quality of Life", description: "Subtle conveniences, faster actions, and usability tweaks" },
  { name: "Performance", description: "FPS optimizations, memory reduction, and stutter fixes" },
  { name: "Accessibility", description: "Colorblind modes, subtitle options, and input remapping" },
  {
    name: "Tools",
    description: "Mod loaders, editors, config tools, and installers",
    children: [
      { name: "Mod Manager", description: "Load order managers and mod installers" },
      { name: "Editor", description: "Map editors, asset extractors, and modding tools" },
      { name: "Installer", description: "Automated setup wizards and patchers" },
      { name: "Utility", description: "Diagnostics, performance benchmarks, and scripts" },
    ],
  },
  { name: "Framework", description: "Core script extenders, APIs, and shared mod dependencies" },
  { name: "Localization", description: "Language translations and regional adaptations" },
];

/**
 * Seed the initial taxonomy tree into MongoDB if empty.
 */
export async function seedDefaultModClassifications(force = false): Promise<{ created: number; existing: number }> {
  await dbConnect();

  const count = await ModClassification.countDocuments();
  if (count > 0 && !force) {
    return { created: 0, existing: count };
  }

  let createdCount = 0;

  async function insertLevel(
    items: typeof INITIAL_TAXONOMY_SEED,
    parentId: Types.ObjectId | null = null,
    parentSlugPrefix = ""
  ) {
    let order = 0;
    for (const item of items) {
      order += 10;
      const baseSlug = slugifyClassification(item.name);
      const slug = parentSlugPrefix ? `${parentSlugPrefix}-${baseSlug}` : baseSlug;

      let doc: (IModClassification & { _id: Types.ObjectId }) | null =
        await ModClassification.findOne({ slug });
      if (!doc) {
        doc = (await ModClassification.create({
          name: item.name,
          slug,
          description: item.description || null,
          parentId,
          sortOrder: order,
          isActive: true,
        })) as unknown as (IModClassification & { _id: Types.ObjectId });
        createdCount++;
      }

      if (item.children && item.children.length > 0) {
        await insertLevel(item.children as typeof INITIAL_TAXONOMY_SEED, doc._id as Types.ObjectId, baseSlug);
      }
    }
  }

  await insertLevel(INITIAL_TAXONOMY_SEED);
  return { created: createdCount, existing: count };
}
