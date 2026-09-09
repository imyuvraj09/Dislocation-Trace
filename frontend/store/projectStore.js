import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { createProject, touchProject } from "@/models/project";
import { createImage, createDefaultViewport, createDefaultLayers } from "@/models/image";
import { STAGES, STATUS, TOTAL_STAGES, getDownstreamStages, getMaterialDependentStages } from "@/constants/pipeline";
import { typeToCategory } from "@/constants/imageWorkspace";

/**
 * The global Project Store.
 *
 * This is the ONLY source of truth for permanent, scientifically-meaningful
 * data in CrystalTrace: the current Project (metadata, pipeline position,
 * images, per-stage outputs, settings, exports).
 *
 * What does NOT belong here: transient UI state local to a single component
 * -- loading spinners, "is this dropdown open", hover state, form-submit
 * flashes. Those stay as component-local `useState`, per the Phase 1 brief.
 *
 * Every mutation goes through `touchProject` so `metadata.updatedAt` always
 * reflects the last change -- this is what autosave (services/autosave.js)
 * and any future "last saved 2m ago" UI will key off of.
 */
const useProjectStore = create(
  subscribeWithSelector((set, get) => ({
    /** @type {import("@/models/project").Project} */
    project: createProject({ name: "Untitled Project" }),

    /** True whenever the in-memory project has unsaved changes. */
    isDirty: false,

    // ---------------------------------------------------------------------
    // Project lifecycle -- normally called via services/projectManager.js
    // and the useProject() hook rather than directly.
    // ---------------------------------------------------------------------

    setProject: (project) => set({ project, isDirty: false }),

    resetProject: (overrides) => set({ project: createProject(overrides), isDirty: false }),

    markClean: () => set({ isDirty: false }),

    updateMetadata: (partial) =>
      set((state) => ({
        project: touchProject({
          ...state.project,
          metadata: { ...state.project.metadata, ...partial },
        }),
        isDirty: true,
      })),

    // ---------------------------------------------------------------------
    // Pipeline navigation (replaces PipelineTimeline's old local useState)
    // ---------------------------------------------------------------------

    setCurrentStage: (stageId) =>
      set((state) => ({
        project: touchProject({
          ...state.project,
          pipeline: { ...state.project.pipeline, currentStage: stageId },
        }),
      })),

    /** Toggles a stage's accordion panel and records that it's been opened at least once. */
    setExpandedStage: (stageId) =>
      set((state) => {
        const { pipeline } = state.project;
        const nextExpanded = pipeline.expandedStage === stageId ? null : stageId;
        const needsStartFlag =
          !pipeline.startedStages.includes(stageId) &&
          !pipeline.completedStages.includes(stageId);

        return {
          project: touchProject({
            ...state.project,
            pipeline: {
              ...pipeline,
              expandedStage: nextExpanded,
              startedStages: needsStartFlag
                ? [...pipeline.startedStages, stageId]
                : pipeline.startedStages,
            },
          }),
        };
      }),

    markStageComplete: (stageId) =>
      set((state) => {
        const { pipeline } = state.project;
        const wasAlreadyComplete = pipeline.completedStages.includes(stageId);
        const wasStale = pipeline.staleStages.includes(stageId);
        if (wasAlreadyComplete && !wasStale) return state;

        const completedStages = wasAlreadyComplete
          ? pipeline.completedStages
          : [...pipeline.completedStages, stageId];
        const staleStages = pipeline.staleStages.filter((id) => id !== stageId);

        return {
          project: touchProject({
            ...state.project,
            pipeline: {
              ...pipeline,
              completedStages,
              staleStages,
              progress: completedStages.length / TOTAL_STAGES,
            },
          }),
          isDirty: true,
        };
      }),

    markStageIncomplete: (stageId) =>
      set((state) => {
        const { pipeline } = state.project;
        const completedStages = pipeline.completedStages.filter((id) => id !== stageId);

        return {
          project: touchProject({
            ...state.project,
            pipeline: {
              ...pipeline,
              completedStages,
              progress: completedStages.length / TOTAL_STAGES,
            },
          }),
          isDirty: true,
        };
      }),

    // ---------------------------------------------------------------------
    // Stage data -- the outputs of an individual pipeline stage only.
    // ---------------------------------------------------------------------

    /**
     * Shallow-merges `partial` into `project.stages[stageId]`.
     *
     * If `stageId` was already complete, this is an *edit* to input another
     * stage may have already computed from -- every stage transitively
     * downstream (constants/pipeline.js's getDownstreamStages) that has
     * actually produced something (complete or already stale) gets flagged
     * stale. Nothing is recomputed and no stage's data is touched here --
     * staleness is purely a flag layered on top, so previous results stay
     * exactly as they were for reference (see models/project.js's
     * `staleStages` doc).
     */
    updateStageData: (stageId, partial) =>
      set((state) => {
        const { pipeline } = state.project;
        const isEditingAlreadyComplete = pipeline.completedStages.includes(stageId);

        let staleStages = pipeline.staleStages;
        if (isEditingAlreadyComplete) {
          // A downstream stage only needs flagging if it's actually produced
          // something from this input already (complete) and isn't already
          // flagged -- a stage that was never run has nothing to invalidate.
          const newlyStale = getDownstreamStages(stageId).filter(
            (id) => pipeline.completedStages.includes(id) && !pipeline.staleStages.includes(id)
          );
          if (newlyStale.length > 0) {
            staleStages = [...pipeline.staleStages, ...newlyStale];
          }
        }

        return {
          project: touchProject({
            ...state.project,
            pipeline: staleStages === pipeline.staleStages ? pipeline : { ...pipeline, staleStages },
            stages: {
              ...state.project.stages,
              [stageId]: { ...state.project.stages[stageId], ...partial },
            },
          }),
          isDirty: true,
        };
      }),

    /**
     * Sets project.material.id (see models/project.js's ProjectMaterial).
     * Not a pipeline stage, but it's upstream of Stage 7's solver exactly
     * the way another stage's data would be -- so changing it after Stage 7
     * was already completed flags Stage 7 (and anything downstream of it)
     * stale using the SAME dependency-graph mechanism updateStageData uses
     * above, via getMaterialDependentStages(), rather than a second,
     * parallel invalidation system.
     */
    setMaterial: (materialId) =>
      set((state) => {
        const { pipeline } = state.project;
        const newlyStale = getMaterialDependentStages().filter(
          (id) => pipeline.completedStages.includes(id) && !pipeline.staleStages.includes(id)
        );
        const staleStages =
          newlyStale.length > 0 ? [...pipeline.staleStages, ...newlyStale] : pipeline.staleStages;

        return {
          project: touchProject({
            ...state.project,
            pipeline: staleStages === pipeline.staleStages ? pipeline : { ...pipeline, staleStages },
            material: {
              ...state.project.material,
              id: materialId,
              cOverA: null,
              selectedBurgersVector: null,
            },
          }),
          isDirty: true,
        };
      }),

    /** Sets the axial ratio used by tetragonal/HCP Cartesian conversion. */
    setCOverA: (cOverA) =>
      set((state) => {
        const { pipeline } = state.project;
        const newlyStale = getMaterialDependentStages().filter(
          (id) => pipeline.completedStages.includes(id) && !pipeline.staleStages.includes(id)
        );
        const staleStages =
          newlyStale.length > 0 ? [...pipeline.staleStages, ...newlyStale] : pipeline.staleStages;

        return {
          project: touchProject({
            ...state.project,
            pipeline: staleStages === pipeline.staleStages ? pipeline : { ...pipeline, staleStages },
            material: {
              ...state.project.material,
              cOverA,
              selectedBurgersVector: null,
            },
          }),
          isDirty: true,
        };
      }),

    // ---------------------------------------------------------------------
    // Images -- shared across stages (and the future Image Viewer /
    // annotation engine), so they live in their own top-level bucket
    // rather than inside a single stage's data.
    // ---------------------------------------------------------------------

    /** @param {"tem"|"diffraction"} bucket -- raw File[] uploads, pre-registration. */
    setImages: (bucket, files) =>
      set((state) => ({
        project: touchProject({
          ...state.project,
          images: { ...state.project.images, [bucket]: files },
        }),
        isDirty: true,
      })),

    // ---------------------------------------------------------------------
    // Image Workspace (Phase 2) -- registry of full Image entities, each
    // carrying its own persistent viewport + layer stack. Distinct from
    // `tem`/`diffraction` above, which are just the raw upload inputs.
    // ---------------------------------------------------------------------

    /**
     * Registers one or more raw image records (upload metadata, or a mock/
     * real API result shaped like lib/mockData.js's MOCK_IMAGES) as full
     * Image Workspace entities. Re-registering an id that already exists
     * refreshes its metadata (filename/dimensions/etc.) without touching
     * its existing viewport or layer state.
     * @param {Array<Object>} records
     * @param {string} [categoryOverride] Force a category instead of deriving one from each record's `type`.
     */
    registerImages: (records, categoryOverride) =>
      set((state) => {
        const images = state.project.images;
        const byId = { ...images.byId };
        const categories = {
          tem: [...images.categories.tem],
          diffraction: [...images.categories.diffraction],
          output: [...images.categories.output],
        };
        let activeImageId = images.activeImageId;

        records.forEach((record) => {
          const category = categoryOverride ?? typeToCategory(record.type);
          byId[record.id] = byId[record.id]
            ? { ...byId[record.id], ...record, id: record.id }
            : createImage(record, category);
          if (!categories[category].includes(record.id)) {
            categories[category] = [...categories[category], record.id];
          }
          if (!activeImageId) activeImageId = record.id;
        });

        return {
          project: touchProject({
            ...state.project,
            images: { ...images, byId, categories, activeImageId },
          }),
          isDirty: true,
        };
      }),

    /** Switches which image the Image Workspace viewer shows. Every image keeps its own viewport, so this never touches viewport data. */
    setActiveImage: (imageId) =>
      set((state) => ({
        project: touchProject({
          ...state.project,
          images: { ...state.project.images, activeImageId: imageId },
        }),
      })),

    /** Shallow-merges a partial update into one image's viewport (zoom/pan/rotation/brightness/contrast/fitToScreen). */
    updateImageViewport: (imageId, partial) =>
      set((state) => {
        const image = state.project.images.byId[imageId];
        if (!image) return state;
        return {
          project: touchProject({
            ...state.project,
            images: {
              ...state.project.images,
              byId: {
                ...state.project.images.byId,
                [imageId]: { ...image, viewport: { ...image.viewport, ...partial } },
              },
            },
          }),
        };
      }),

    /** Resets one image's viewport back to defaults (100% zoom, centered, fit-to-screen). */
    resetImageViewport: (imageId) =>
      set((state) => {
        const image = state.project.images.byId[imageId];
        if (!image) return state;
        return {
          project: touchProject({
            ...state.project,
            images: {
              ...state.project.images,
              byId: {
                ...state.project.images.byId,
                [imageId]: { ...image, viewport: createDefaultViewport() },
              },
            },
          }),
        };
      }),

    /** Toggles/sets a single layer's visibility or lock on one image. Locked layers ignore both. */
    setLayerProperty: (imageId, layerId, partial) =>
      set((state) => {
        const image = state.project.images.byId[imageId];
        if (!image) return state;
        const layers = image.layers.map((layer) =>
          layer.id === layerId && !layer.locked ? { ...layer, ...partial } : layer
        );
        return {
          project: touchProject({
            ...state.project,
            images: {
              ...state.project.images,
              byId: { ...state.project.images.byId, [imageId]: { ...image, layers } },
            },
          }),
          isDirty: true,
        };
      }),

    /** Reassigns stacking order from a full, reordered list of layer ids (bottom to top). Locked layers can't move. */
    reorderLayers: (imageId, orderedLayerIds) =>
      set((state) => {
        const image = state.project.images.byId[imageId];
        if (!image) return state;
        const lockedPositions = image.layers.filter((l) => l.locked).map((l) => l.id);
        // Ignore attempts to move a locked layer -- keep the incoming order for
        // everything else, but locked layers stay exactly where they were.
        const nextOrder = orderedLayerIds.filter((id) => !lockedPositions.includes(id));
        const lockedFirst = image.layers.filter((l) => l.locked).map((l) => l.id);
        const finalOrder = [...lockedFirst, ...nextOrder];

        const layers = image.layers.map((layer) => ({
          ...layer,
          zIndex: finalOrder.indexOf(layer.id),
        }));

        return {
          project: touchProject({
            ...state.project,
            images: {
              ...state.project.images,
              byId: { ...state.project.images.byId, [imageId]: { ...image, layers } },
            },
          }),
          isDirty: true,
        };
      }),

    /**
     * Removes an image from the workspace registry entirely (all
     * categories, plus re-picking activeImageId if it was the active one).
     * Store-level only -- there's no UI entry point yet and no filesystem
     * cleanup (nothing on disk to remove in-browser).
     */
    removeImage: (imageId) =>
      set((state) => {
        const images = state.project.images;
        if (!images.byId[imageId]) return state;

        const { [imageId]: _removed, ...byId } = images.byId;
        const categories = Object.fromEntries(
          Object.entries(images.categories).map(([category, ids]) => [
            category,
            ids.filter((id) => id !== imageId),
          ])
        );
        const activeImageId =
          images.activeImageId === imageId
            ? Object.values(categories).flat()[0] ?? null
            : images.activeImageId;

        return {
          project: touchProject({
            ...state.project,
            images: { ...images, byId, categories, activeImageId },
          }),
          isDirty: true,
        };
      }),

    /**
     * Duplicates an image entity (fresh id, filename suffixed "(copy)",
     * fresh viewport and layer stack) into the same category. Store-level
     * only -- there's no UI entry point yet, and no underlying file is
     * copied (nothing on disk to copy in-browser).
     */
    duplicateImage: (imageId) =>
      set((state) => {
        const images = state.project.images;
        const source = images.byId[imageId];
        if (!source) return state;

        const newId = `${imageId}_copy_${Date.now().toString(36)}`;
        const duplicate = {
          ...source,
          id: newId,
          filename: `${source.filename} (copy)`,
          viewport: createDefaultViewport(),
          layers: createDefaultLayers(),
        };
        const category =
          Object.entries(images.categories).find(([, ids]) => ids.includes(imageId))?.[0] ?? "output";

        return {
          project: touchProject({
            ...state.project,
            images: {
              ...images,
              byId: { ...images.byId, [newId]: duplicate },
              categories: { ...images.categories, [category]: [...images.categories[category], newId] },
            },
          }),
          isDirty: true,
        };
      }),

    // ---------------------------------------------------------------------
    // Exports
    // ---------------------------------------------------------------------

    appendExportRecord: (record) =>
      set((state) => ({
        project: touchProject({
          ...state.project,
          exports: {
            ...state.project.exports,
            history: [...state.project.exports.history, record],
          },
        }),
        isDirty: true,
      })),

    // ---------------------------------------------------------------------
    // Selected Burgers vector (g·b Explorer selection & per-pair entries)
    // ---------------------------------------------------------------------

    setSelectedBurgersVector: (vector) =>
      set((state) => ({
        project: touchProject({
          ...state.project,
          material: {
            ...state.project.material,
            selectedBurgersVector: vector,
          },
        }),
        isDirty: true,
      })),

    setPairBurgersVector: (pairId, vector, source = "Known Burgers vector entered manually") =>
      set((state) => {
        const material = state.project.material ?? {};
        const stage7 = state.project.stages[7] ?? {};
        const classificationsByPair = { ...(stage7.classificationsByPair ?? {}) };
        delete classificationsByPair[pairId];

        return {
          project: touchProject({
            ...state.project,
            material: {
              ...material,
              burgersByPair: {
                ...(material.burgersByPair ?? {}),
                [pairId]: vector,
              },
              burgersSourceByPair: {
                ...(material.burgersSourceByPair ?? {}),
                [pairId]: source,
              },
            },
            stages: {
              ...state.project.stages,
              7: {
                ...stage7,
                classificationsByPair,
                rows: [],
              },
            },
          }),
          isDirty: true,
        };
      }),

    setAllPairsBurgersVector: (vector, source = "Known Burgers vector entered manually", pairIds = []) =>
      set((state) => {
        const material = state.project.material ?? {};
        const stage7 = state.project.stages[7] ?? {};
        const nextBurgersByPair = { ...(material.burgersByPair ?? {}) };
        const nextSourceByPair = { ...(material.burgersSourceByPair ?? {}) };

        pairIds.forEach((pid) => {
          nextBurgersByPair[pid] = vector;
          nextSourceByPair[pid] = source;
        });

        return {
          project: touchProject({
            ...state.project,
            material: {
              ...material,
              burgersByPair: nextBurgersByPair,
              burgersSourceByPair: nextSourceByPair,
            },
            stages: {
              ...state.project.stages,
              7: {
                ...stage7,
                classificationsByPair: {},
                rows: [],
              },
            },
          }),
          isDirty: true,
        };
      }),

    setPairClassification: (pairId, classification) =>
      set((state) => {
        const stage7 = state.project.stages[7] ?? {};
        return {
          project: touchProject({
            ...state.project,
            stages: {
              ...state.project.stages,
              7: {
                ...stage7,
                classificationsByPair: {
                  ...(stage7.classificationsByPair ?? {}),
                  [pairId]: classification,
                },
              },
            },
          }),
          isDirty: true,
        };
      }),
  }))
);

export default useProjectStore;

// ---------------------------------------------------------------------------
// Selectors -- kept next to the store so there's exactly one definition of
// "how to read X out of a project". Hooks and components should prefer
// these over reaching into `project.*` paths directly.
// ---------------------------------------------------------------------------

export const selectProject = (state) => state.project;
export const selectPipeline = (state) => state.project.pipeline;
export const selectImages = (state) => state.project.images;
export const selectStageData = (stageId) => (state) => state.project.stages[stageId];
export const selectSelectedBurgersVector = (state) => state.project.material?.selectedBurgersVector ?? null;
export const selectBurgersByPair = (state) => state.project.material?.burgersByPair ?? {};
export const selectBurgersSourceByPair = (state) => state.project.material?.burgersSourceByPair ?? {};

/** The currently active Image entity in the Image Workspace, or null if none is registered/selected. */
export const selectActiveImage = (state) => {
  const { byId, activeImageId } = state.project.images;
  return activeImageId ? byId[activeImageId] ?? null : null;
};

/** A single category's ordered list of Image entities (not just ids). */
export const selectImagesByCategory = (category) => (state) => {
  const { byId, categories } = state.project.images;
  return categories[category].map((id) => byId[id]).filter(Boolean);
};

/** Derives a stage's {@link STATUS} from pipeline.completedStages / staleStages / startedStages. */
export function stageStatus(project, stageId) {
  if (project.pipeline.staleStages.includes(stageId)) return STATUS.STALE;
  if (project.pipeline.completedStages.includes(stageId)) return STATUS.COMPLETE;
  if (project.pipeline.startedStages.includes(stageId)) return STATUS.IN_PROGRESS;
  return STATUS.PENDING;
}
