import { SCHEMA_VERSION } from "@/constants/schema";
import { STAGES } from "@/constants/pipeline";
import { createInitialStages } from "@/models/stage";

/**
 * The Project model. This is the ENTIRE shape held by the Zustand project
 * store (see store/projectStore.js) -- it is the single source of truth
 * for a CrystalTrace analysis session.
 *
 * @typedef {Object} ProjectMetadata
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} createdAt  ISO timestamp
 * @property {string} updatedAt  ISO timestamp
 * @property {number} schemaVersion
 *
 * @typedef {Object} ProjectPipelineState
 * @property {number} currentStage      Stage id the user is actively working on.
 * @property {number|null} expandedStage Stage id currently expanded in the timeline (accordion).
 * @property {number[]} completedStages  Stage ids that have been marked complete.
 * @property {number[]} staleStages      Stage ids whose displayed results were computed from
 *   upstream input that has since changed (see constants/pipeline.js's STAGE_DEPENDENCIES /
 *   getDownstreamStages, and store/projectStore.js's updateStageData). A stale stage's previous
 *   results are kept for reference, not discarded -- staleness only means "recompute before
 *   trusting this," not "this is gone." Cleared when that stage is completed again.
 * @property {number[]} startedStages    Stage ids that have been opened at least once (drives the "in progress" badge).
 * @property {number} progress           completedStages.length / total stages, 0..1.
 *
 * @typedef {Object} ProjectImages
 * @property {File[]} tem          Raw uploaded TEM bright/dark-field files (Stage 1 input, pre-registration).
 * @property {File[]} diffraction  Raw uploaded diffraction (SAED) files (Stage 1 input, pre-registration).
 * @property {Object<string, import("@/models/image").ImageEntity>} byId
 *   The Image Workspace registry (Phase 2) -- every registered image, keyed by id. This is what
 *   ImageViewer/ImageBrowser/LayerManager read and write (via viewport/layer store actions), and
 *   what carries each image's persistent viewport + layer stack.
 * @property {{tem: string[], diffraction: string[], output: string[]}} categories
 *   Ordered image ids per Image Browser category. An id's presence here (not its `type` field alone)
 *   is what the Image Browser groups by.
 * @property {string|null} activeImageId  The image currently shown in the Image Workspace viewer.
 *
 * @typedef {Object} ProjectMaterial
 * @property {string|null} id  A crystallography materialId (manifest key from
 *   backend/crystallography/data/manifest.json, e.g. "FCC_Face_Centered_Cubic"),
 *   or null if the user hasn't selected one yet. This is the ONLY thing the
 *   project ever persists about the material -- see backend/crystallography's
 *   package docstring and the DATABASE INTEGRATION / MATERIAL MODEL sections
 *   of the integration spec ("Store project.materialId. Never copy the
 *   database into project.json."). Everything else about the material
 *   (its Burgers-vector family, reflection table, etc.) is re-fetched from
 *   GET /api/materials/{id} on demand, never embedded here.
 * @property {number|null} cOverA  User-entered axial ratio for tetragonal/HCP.
 *
 * @typedef {Object} Project
 * @property {ProjectMetadata} metadata
 * @property {ProjectPipelineState} pipeline
 * @property {ProjectImages} images
 * @property {ProjectMaterial} material
 * @property {Object} annotations  Reserved for the future annotation engine (Phase 3+); empty for now.
 * @property {Object<number, Object>} stages  Per-stage data, keyed by stage id -- see models/stage.js.
 * @property {Object} settings
 * @property {Object} exports
 * @property {Object} history  Undo/redo scaffold (Phase 2); not wired up yet.
 */

function generateId() {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Creates a brand-new, empty Project.
 * @param {{name?: string, description?: string}} [opts]
 * @returns {Project}
 */
export function createProject({ name = "Untitled Project", description = "" } = {}) {
  const now = new Date().toISOString();

  return {
    metadata: {
      id: generateId(),
      name,
      description,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION,
    },

    pipeline: {
      currentStage: STAGES[0].id,
      expandedStage: STAGES[0].id,
      completedStages: [],
      staleStages: [],
      startedStages: [],
      progress: 0,
    },

    images: {
      tem: [],
      diffraction: [],
      byId: {},
      categories: { tem: [], diffraction: [], output: [] },
      activeImageId: null,
    },

    // See ProjectMaterial above -- set via store/projectStore.js's
    // setMaterial() action, read by Stage 7 to know which
    // crystallographically-allowed Burgers-vector family to solve
    // candidates against.
    material: {
      id: null,
      cOverA: null,
      selectedBurgersVector: null,
      burgersByPair: {},
      burgersSourceByPair: {},
    },

    // Reserved for the future annotation engine (Phase 3+). Each image
    // already has an "Annotation Layer" placeholder in its layer stack
    // (see models/image.js) for this to attach to; expect something like
    // { [imageId]: Annotation[] } once real annotation tools exist.
    annotations: {},

    stages: createInitialStages(),

    settings: {
      units: "nm",
      angleUnit: "deg",
      theme: "system",
    },

    exports: {
      history: [], // { id, filename, rowCount, exportedAt }
    },

    // Scaffold only -- Phase 1 does not implement undo/redo. Kept in the
    // model now so the store shape doesn't need another migration later.
    history: {
      past: [],
      future: [],
      maxSize: 50,
    },
  };
}

/**
 * Returns a copy of `project` with `updatedAt` refreshed to now. Every
 * store mutation that changes user-visible data should route through this
 * so "last modified" stays accurate without every action remembering to
 * set it manually.
 * @param {Project} project
 * @returns {Project}
 */
export function touchProject(project) {
  return {
    ...project,
    metadata: { ...project.metadata, updatedAt: new Date().toISOString() },
  };
}

/**
 * Deep-clones a project for "duplicate project", assigning it a new id and
 * fresh timestamps.
 *
 * CAVEAT: this uses a JSON round-trip, which silently drops any raw
 * File/Blob objects held in `images.tem` / `images.diffraction` (they
 * serialize to `{}`). That's acceptable for Phase 1, where those files
 * only exist transiently in memory for the mock upload step. Once real
 * filesystem-backed image storage exists (Phase 2+, Electron), duplication
 * should copy the underlying files on disk instead of cloning in-memory
 * File objects.
 *
 * @param {Project} project
 * @param {Partial<ProjectMetadata>} [overrides]
 * @returns {Project}
 */
export function cloneProject(project, overrides = {}) {
  const now = new Date().toISOString();
  const clone = JSON.parse(JSON.stringify(project));

  return {
    ...clone,
    metadata: {
      ...clone.metadata,
      ...overrides,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    },
  };
}
