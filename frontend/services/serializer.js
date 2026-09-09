import { validateProjectShape } from "@/services/validation";
import { SCHEMA_VERSION } from "@/constants/schema";
import { createImage, createDefaultCalibration, createDefaultStatistics, createDefaultCache } from "@/models/image";
import { typeToCategory } from "@/constants/imageWorkspace";

/**
 * Serializes a Project to a JSON string.
 *
 * NOTE: raw `File`/`Blob` objects (project.images.tem / .diffraction) are
 * not JSON-serializable -- `JSON.stringify` would silently turn each one
 * into `{}`. We instead reduce them to lightweight, round-trippable
 * metadata. Real binary persistence (writing the actual image bytes
 * somewhere durable) is a Phase 2+ concern once there's an Electron/Python
 * backend that can read files from disk; see docs/ARCHITECTURE.md.
 *
 * @param {import("@/models/project").Project} project
 * @returns {string}
 */
export function serializeProject(project) {
  const portable = {
    ...project,
    images: {
      ...project.images,
      tem: toFileMetadata(project.images.tem),
      diffraction: toFileMetadata(project.images.diffraction),
    },
  };
  return JSON.stringify(portable, null, 2);
}

function toFileMetadata(files = []) {
  return files.map((file) =>
    typeof File !== "undefined" && file instanceof File
      ? { name: file.name, size: file.size, type: file.type }
      : file
  );
}

/**
 * Parses and validates a previously-saved project.
 * @param {string} jsonString
 * @returns {import("@/models/project").Project}
 * @throws {Error} if the string isn't valid JSON or doesn't look like a Project.
 */
export function deserializeProject(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error("Invalid project file: not valid JSON.");
  }

  const { valid, missing } = validateProjectShape(parsed);
  if (!valid) {
    throw new Error(`Invalid project file: missing field(s) ${missing.join(", ")}.`);
  }

  return migrateProject(parsed);
}

/**
 * Schema migration point. Each branch upgrades exactly one version step;
 * migrateProject re-runs until the project is caught up to
 * {@link SCHEMA_VERSION}, so a file several versions behind still loads.
 */
function migrateProject(project) {
  let migrated = project;
  const version = migrated.metadata?.schemaVersion ?? 1;

  if (version < 2) migrated = migrateV1ToV2(migrated);
  if (version < 3) migrated = migrateV2ToV3(migrated);
  if (version < 4) migrated = migrateV3ToV4(migrated);
  if (version < 5) migrated = migrateV4ToV5(migrated);
  if (version < 6) migrated = migrateV5ToV6(migrated);

  if (migrated.metadata?.schemaVersion !== SCHEMA_VERSION) {
    migrated = { ...migrated, metadata: { ...migrated.metadata, schemaVersion: SCHEMA_VERSION } };
  }
  return migrated;
}

/**
 * v1 -> v2 (Phase 2 Image Workspace): `images.detected` (a flat array of
 * mock detection records) is replaced by a proper registry --
 * `images.byId` / `images.categories` / `images.activeImageId` -- so every
 * image can carry its own persistent viewport and layer stack. Old
 * `detected` records become Output-category Image entities.
 */
function migrateV1ToV2(project) {
  const images = project.images ?? {};
  if (images.byId) return project; // already migrated (or created fresh at v2+)

  const byId = {};
  const categories = { tem: [], diffraction: [], output: [] };

  (images.detected ?? []).forEach((record) => {
    const category = typeToCategory(record.type);
    const entity = createImage(record, category);
    byId[entity.id] = entity;
    categories[category].push(entity.id);
  });

  return {
    ...project,
    images: {
      tem: images.tem ?? [],
      diffraction: images.diffraction ?? [],
      byId,
      categories,
      activeImageId: Object.keys(byId)[0] ?? null,
    },
    metadata: { ...project.metadata, schemaVersion: 2 },
  };
}

/**
 * v2 -> v3 (Image Workspace stabilization): backfills every registered
 * image with the new `path` / `calibration` / `statistics` / `cache`
 * fields (all null-defaulted -- nothing before this version could have
 * populated them), and renames each layer's `kind` -> `type` and
 * `order` -> `zIndex`, adding the new `opacity`/`blendMode` fields.
 */
function migrateV2ToV3(project) {
  const images = project.images ?? {};
  const byId = Object.fromEntries(
    Object.entries(images.byId ?? {}).map(([id, image]) => [
      id,
      {
        ...image,
        path: image.path ?? null,
        calibration: image.calibration ?? createDefaultCalibration(),
        statistics: image.statistics ?? createDefaultStatistics(),
        cache: image.cache ?? createDefaultCache(),
        layers: (image.layers ?? []).map((layer) => ({
          id: layer.id,
          name: layer.name,
          type: layer.type ?? layer.kind,
          visible: layer.visible,
          locked: layer.locked,
          opacity: layer.opacity ?? 1,
          zIndex: layer.zIndex ?? layer.order ?? 0,
          blendMode: layer.blendMode ?? "normal",
        })),
      },
    ])
  );

  return {
    ...project,
    images: { ...images, byId },
    metadata: { ...project.metadata, schemaVersion: 3 },
  };
}

/**
 * v3 -> v4 (stale-result tracking): backfills `pipeline.staleStages` with
 * an empty array for projects saved before it existed -- an old save file
 * has no way to have flagged anything stale, so "nothing stale" is exactly
 * correct, not a placeholder.
 */
function migrateV3ToV4(project) {
  return {
    ...project,
    pipeline: { ...project.pipeline, staleStages: project.pipeline?.staleStages ?? [] },
    metadata: { ...project.metadata, schemaVersion: 4 },
  };
}

/**
 * v4 -> v5 (experimental g.b workflow): adds the top-level `material`
 * bucket (defaulted to unselected -- an old save file was made before
 * material selection existed, so there's nothing to backfill it with),
 * and replaces Stage 7's old manually-entered-Burgers-vector shape with
 * the new gbObservations shape.
 *
 * Old `stage7.burgers` (a user-typed value, real prior experimental
 * input even if this stage's *workflow* has changed) is not silently
 * discarded -- it's preserved under `legacyBurgers` on the migrated
 * Stage7Data so it's still visible/recoverable, even though the new UI
 * no longer reads it. `stage7.classifications` (the old
 * classify-on-demand results for that manually-typed vector) is dropped:
 * those results lived downstream of a workflow this version removes, and
 * keeping them would misleadingly suggest they came from the new
 * observation-based resolution this stage now performs.
 */
function migrateV4ToV5(project) {
  const oldStage7 = project.stages?.[7] ?? {};
  const hasLegacyBurgers =
    Array.isArray(oldStage7.burgers) && oldStage7.burgers.some((v) => v !== "" && v != null);

  const newStage7 = {
    gbObservations: Array.isArray(oldStage7.gbObservations) ? oldStage7.gbObservations : [],
    ...(hasLegacyBurgers ? { legacyBurgers: oldStage7.burgers } : {}),
  };

  return {
    ...project,
    material: project.material ?? { id: null },
    stages: { ...project.stages, 7: newStage7 },
    metadata: { ...project.metadata, schemaVersion: 5 },
  };
}

/** v5 -> v6: add the user-entered axial ratio used by non-cubic geometry and pair-specific Burgers vectors. */
function migrateV5ToV6(project) {
  return {
    ...project,
    material: {
      id: project.material?.id ?? null,
      cOverA: project.material?.cOverA ?? null,
      selectedBurgersVector: project.material?.selectedBurgersVector ?? null,
      burgersByPair: project.material?.burgersByPair ?? {},
      burgersSourceByPair: project.material?.burgersSourceByPair ?? {},
    },
    metadata: { ...project.metadata, schemaVersion: 6 },
  };
}
