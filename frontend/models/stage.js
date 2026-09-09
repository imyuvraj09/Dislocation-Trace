/**
 * Per-stage data shapes.
 *
 * IMPORTANT: a stage's entry here holds ONLY the outputs/inputs that are
 * specific to that stage. Cross-cutting resources that don't belong to a
 * single stage -- like the uploaded/detected images -- live in their own
 * top-level Project bucket (`project.images`) instead.
 *
 * Stage numbering matches constants/pipeline.js's 8-stage list, which
 * mirrors the backend's actual endpoints 1:1 (old frontend Stage 4 "Angle
 * Computation" and Stage 5 "G-vector Confirmation" were merged into one
 * Stage 4, since the backend only ever exposed a single
 * POST /api/stage4/angles endpoint for both concerns).
 *
 * @typedef {Object} DetectedLineRef  One DetectedLine as returned by the backend.
 * @property {string} label   e.g. "L1" -- an identifier *within its own image only*.
 * @property {string} image
 * @property {number} x1
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 *
 * @typedef {Object} DetectedGVectorRef  One GVector as returned by the backend.
 * @property {string} g_id   e.g. "g01"
 * @property {string} source Diffraction image basename.
 * @property {number[]|null} hkl  Three indices for cubic/tetragonal, four hkil indices for HCP.
 *
 * @typedef {Object} Stage1Data
 * @property {number|null} detectedLines
 * @property {number} imageCount
 * @property {Array<{image: string, lines: DetectedLineRef[]}>} temImages
 *   Every uploaded TEM image with its raw detected lines, in upload order --
 *   this is what Stage 3's line-pairing UI reads to list selectable labels.
 * @property {Array<{image: string, gvecs: DetectedGVectorRef[]}>} diffImages
 *   Every uploaded diffraction image with its raw detected g-vectors, in
 *   upload order -- this is what Stage 2's Miller-indexing UI reads.
 *
 * @typedef {Object} ZoneAxisEntry
 * @property {string} h
 * @property {string} k
 * @property {string} l
 * @property {string|null} diffImage  Which uploaded diffraction image this TEM image's zone
 *   axis/indices were determined from (POST /api/stage4/angles' tem_to_diff). User-selected,
 *   never inferred by position/order.
 *
 * @typedef {Object} Stage2Data
 * @property {Object<string, ZoneAxisEntry>} zoneAxisByTemImage
 *   Keyed by TEM image basename. Every TEM image starts with no zone axis
 *   and no diffraction-image association until the user sets both.
 * @property {Object<string, Object<string, string[]>>} millerIndexByGvector
 *   Keyed by [diffraction image basename][g_id] -> user-typed hkl or HCP hkil
 *   strings (kept as strings while editing; parsed to integers only at
 *   submission -- see lib/api.js's submitMillerAssignments).
 *
 * @typedef {Object} LinePairDraft
 * @property {string} pairId    e.g. "P1" -- user-assigned, editable until submitted.
 * @property {string} image1
 * @property {string} lineId1   A label from image1's detected lines (DetectedLineRef.label).
 * @property {string} image2
 * @property {string} lineId2   A label from image2's detected lines -- may or may not equal lineId1.
 *
 * @typedef {Object} Stage3Data
 * @property {LinePairDraft[]} pairs           Pairs the user has built (editable until submitted).
 * @property {LinePairDraft[]|null} submittedPairs  Snapshot of `pairs` as last accepted by the
 *   backend (POST /api/stage3/pairs) -- the single source of truth every later stage reads pairs
 *   from, so editing `pairs` again doesn't retroactively change what Stage 4+ already computed on.
 *
 * @typedef {Object} PairGVectorSelection
 * @property {string} pairId
 * @property {string} image       TEM image basename (which line this selection is for).
 * @property {string} diffImage
 * @property {[string,string,string]} gIds  Exactly 3 g_ids, user-picked, independently per pair+image.
 *
 * @typedef {Object} Stage4Data
 * @property {PairGVectorSelection[]} selections  One entry per (pair, image) -- i.e. 2 per pair.
 * @property {Array<Object>|null} angles          Backend AngleRow[] once computed.
 *
 * @typedef {Object} Stage5Data
 * @property {Object|null} resultsByPairImage  Keyed by "pairId::image" -> backend SolveResult.
 *
 * @typedef {Object} Stage6Data
 * @property {Array<Object>} lines
 *
 * @typedef {Object} GBObservationRow  One experimental g.b observation -- one
 *   (pair, image, g-vector) combination, auto-generated from Stage 3's
 *   submittedPairs + Stage 4's selections + Stage 2's millerIndexByGvector.
 *   The user only ever edits `gb`.
 * @property {string} imageId
 * @property {string} gVectorId
 * @property {number[]} millerIndex  hkl, or HCP hkil.
 * @property {1|0|-1|null} gb   Observed g.b -- null until the user records it.
 * @property {string} notes
 * @property {string|null} timestamp
 *
 * @typedef {Object} BurgersCandidate  One crystallographically-consistent
 *   candidate returned by the backend solver (crystallography/solver.py,
 *   ported from g.b's BurgersSolver).
 * @property {string} label       Display label, e.g. "½[110]".
 * @property {number[]} b_vector  uvw, or HCP uvtw.
 * @property {number} confidence  0..100 -- Stage 7 only ever surfaces the
 *   100-confidence ones (backend's fully_consistent_candidates); the field
 *   is kept here because the backend returns it, not because the UI filters
 *   on anything less than 100 itself.
 * @property {string} status      "Verified" | "Unverified"
 *
 * @typedef {Object} PairGbRecord  One pair's full experimental g.b record --
 *   see PROJECT DATA MODEL in the integration spec.
 * @property {string} pairId
 * @property {GBObservationRow[]} observations
 * @property {BurgersCandidate[]} candidateBurgersVectors  Every candidate
 *   consistent with the observations recorded so far (may be empty, one, or
 *   several -- see AUTOMATIC BURGERS-VECTOR DETERMINATION in the spec).
 * @property {number[]|null} resolvedBurgersVector  Set
 *   automatically when exactly one candidate remains, or by the user
 *   confirming one of several via POST /api/stage8/select-burgers-candidate.
 *   NEVER set by free-text entry -- there is no Burgers-vector textbox
 *   anywhere in this stage.
 * @property {string} mathDerivation  Transparent, reproducible audit trail
 *   of how resolvedBurgersVector (or the candidate list) was derived.
 * @property {Object|null} classification  The existing classifier's result
 *   (character, slip system) for resolvedBurgersVector, once resolved --
 *   see fileskh/classifier.py (untouched) and
 *   app/routers/stage8_classify.py's _run_solver_and_maybe_classify /
 *   select_burgers_candidate. Null until resolvedBurgersVector is set.
 *
 * @typedef {Object} Stage7Data
 * @property {PairGbRecord[]} gbObservations  One entry per pair with
 *   generated observation rows.
 *
 * @typedef {Object} Stage8Data
 * @property {Array<Object>} rows
 * @property {string|null} lastExportedAt
 */

/** Default ("empty") data for every stage, keyed by stage id. */
export const INITIAL_STAGE_DATA = {
  1: { detectedLines: null, imageCount: 0, temImages: [], diffImages: [] },
  2: { zoneAxisByTemImage: {}, millerIndexByGvector: {} },
  3: { pairs: [], submittedPairs: null },
  4: { useCommonGVectors: false, commonSelections: {}, overrides: {}, selections: [], angles: null },
  5: { resultsByPairImage: {} },
  6: { lines: [] },
  7: { burgersByPair: {}, burgersSourceByPair: {}, classificationsByPair: {}, rows: [], lastExportedAt: null, gbObservations: [] },
  8: { rows: [], lastExportedAt: null },
};

/**
 * Returns a fresh, independent copy of INITIAL_STAGE_DATA. Every value in
 * that map is plain JSON-safe data (no Dates, Files, or functions), so a
 * JSON round-trip is a safe and dependency-free deep clone.
 */
export function createInitialStages() {
  return JSON.parse(JSON.stringify(INITIAL_STAGE_DATA));
}
