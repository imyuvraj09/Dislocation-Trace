/**
 * Single source of truth for the 7 pipeline stages.
 *
 * The timeline, progress indicator, routing, and the Zustand project store
 * all read from this list so that adding, renaming, or reordering a stage
 * never has to happen in more than one place.
 *
 * `kind` tells the timeline which generic interaction shell to reach for
 * (upload / form / table) before it mounts the stage-specific component.
 *
 * NOTE: this used to live at lib/pipelineConfig.js. It now lives here as
 * part of the Phase 1 architecture migration (see docs/ARCHITECTURE.md).
 * lib/pipelineConfig.js re-exports from this file so older imports keep
 * working.
 */
export const STAGES = [
  {
    id: 1,
    slug: "image-detection",
    title: "Image Detection",
    kind: "upload",
    summary:
      "Upload paired TEM bright-field/dark-field and diffraction images for a foil orientation.",
  },
  {
    id: 2,
    slug: "zone-axis-and-miller-index",
    title: "Step 2 — Zone axes and diffraction indexing",
    kind: "form",
    summary:
      "Enter the zone axes and Miller indices determined from your diffraction patterns.",
  },
  {
    id: 3,
    slug: "line-pairing",
    title: "Dislocation-segment pairing",
    kind: "table",
    summary:
      "Match the same physical dislocation segment in the two TEM images using its marked label, such as M1 or M2. Labels identify the traces you drew in each image; the same segment may be labelled M1 in the first image and M2 in the second. Pair segments by their physical correspondence, not by matching label numbers.",
  },
  {
    id: 4,
    slug: "g-vector-assignment-and-angles",
    title: "G-vector Assignment & Angle Computation",
    kind: "form",
    summary:
      "For each manually created line pair, choose exactly 3 g-vectors (from Stage 2's indexed list) per line, then compute trace angles.",
  },
  {
    id: 5,
    slug: "up-vector-solving",
    title: "Up-vector Solving",
    kind: "form",
    summary:
      "Solve the foil-normal (up) vector for every pair, using each image's user-entered zone axis and the g-vectors assigned in Stage 4.",
  },
  {
    id: 6,
    slug: "true-dislocation-line",
    title: "True Dislocation Line",
    kind: "table",
    summary:
      "Reconstruct the true 3-D dislocation line direction from paired trace angles and the up-vector.",
  },
  {
    id: 7,
    slug: "batch-output",
    title: "Burgers Vector, Classification and Output",
    kind: "table",
    summary:
      "Enter or review Burgers vectors, classify dislocation characters and slip planes, and generate the batch report.",
  },
];

export const STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETE: "complete",
  STALE: "stale",
};

/** Ordered list of stage ids, e.g. [1, 2, ..., 9]. Handy for iteration and validation. */
export const STAGE_IDS = STAGES.map((s) => s.id);

export const TOTAL_STAGES = STAGES.length;

/** Look up static stage config (title/summary/kind) by id. */
export function getStageConfig(stageId) {
  return STAGES.find((s) => s.id === stageId) ?? null;
}

/**
 * Which stages a given stage's *scientific input* is drawn from -- i.e. if
 * stage N's data changes after stage N was already complete, every stage
 * listed as depending on N (directly or transitively) may have been
 * computed from now-outdated input and should be flagged stale (see
 * store/projectStore.js's `updateStageData` and `getDownstreamStages`
 * below). This mirrors the pipeline's actual data flow, not just stage
 * order -- e.g. Stage 8 (Batch) depends on Stage 2 directly (it reads each
 * pair's diffraction-image association), not only on Stage 7.
 */
export const STAGE_DEPENDENCIES = {
  1: [],
  2: [1],
  3: [1],
  4: [2, 3],
  5: [2, 4],
  6: [3, 5],
  7: [2, 3, 6],
};

/**
 * Every stage that transitively depends on `stageId` -- the set that
 * should be considered for stale-marking when `stageId`'s data changes.
 * @param {number} stageId
 * @returns {number[]}
 */
export function getDownstreamStages(stageId) {
  const downstream = new Set();
  let frontier = [stageId];

  while (frontier.length > 0) {
    const next = [];
    for (const id of frontier) {
      for (const candidate of STAGE_IDS) {
        const deps = STAGE_DEPENDENCIES[candidate] ?? [];
        if (deps.includes(id) && !downstream.has(candidate)) {
          downstream.add(candidate);
          next.push(candidate);
        }
      }
    }
    frontier = next;
  }

  return [...downstream];
}

/**
 * Stages whose scientific input includes `project.material.id` directly
 * (today, only Stage 7 -- its solver resolves candidate Burgers vectors
 * against the selected material's crystallographically-allowed family).
 * Material selection isn't a numbered pipeline stage (see the integration
 * plan), so it can't appear as a key in STAGE_DEPENDENCIES the way stage
 * inputs do -- this constant plus getMaterialDependentStages() is the
 * smallest possible extension of the SAME dependency-graph idea rather
 * than a second, parallel system: changing material invalidates these
 * stages exactly the way changing Stage 6 invalidates Stage 7.
 */
export const MATERIAL_DEPENDENT_STAGES = [2];

/**
 * MATERIAL_DEPENDENT_STAGES plus everything transitively downstream of
 * them -- the full set to flag stale when the user changes
 * project.material.id after Stage 7 was already completed.
 * @returns {number[]}
 */
export function getMaterialDependentStages() {
  const all = new Set(MATERIAL_DEPENDENT_STAGES);
  for (const stageId of MATERIAL_DEPENDENT_STAGES) {
    for (const downstream of getDownstreamStages(stageId)) {
      all.add(downstream);
    }
  }
  return [...all];
}
