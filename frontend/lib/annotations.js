/**
 * lib/annotations.js
 * ===================
 * The one shared shape for a dislocation-line annotation, whether it came
 * from Stage 1's backend detection or was drawn by hand in the Image
 * Workspace. Both live in the exact same array
 * (`project.stages[1].temImages[i].lines`) -- there is no separate
 * "manual annotations" collection -- so every consumer (Stage 3's pairing
 * UI, the Workspace's renderers, Stage 4+) operates on one list, filtered
 * by `source` or `deleted` only when it actually needs to.
 *
 * Shape:
 *   {
 *     id,               // stable, unique per (image, label)
 *     label,            // "L1", "L2", ... (detected) or "M1", "M2", ... (manual)
 *     image,             // TEM image basename/filename
 *     x1, y1, x2, y2,    // endpoints, always in true image-pixel coordinates
 *     source,            // "detected" | "manual"
 *     visible,           // display preference only -- see note below
 *     deleted,           // true = excluded from every downstream stage
 *   }
 *
 * `deleted` vs `visible`: deleting a line is a scientific correction (the
 * detector was wrong, or a manual line should never have existed) and is
 * what Stage 3+ must never see again. `visible` is a purely cosmetic
 * declutter toggle in the Workspace viewer and carries no scientific
 * meaning -- see hooks/useLineAnnotations.js for why it's therefore kept
 * out of this object entirely (component-local state, not Project Store
 * data), rather than living here as a field that would trigger the stage
 * invalidation system on every hide/show click.
 */

/** Builds a stable id for a line from its image + label (unique within that image). */
export function lineId(image, label) {
  return `${image}::${label}`;
}

/**
 * Normalizes a raw DetectedLine from the backend (label/image/x1..y2/vx/vy/
 * length_px/color) into the unified annotation shape. Called once, when
 * Stage 1 registers detection results -- nowhere else needs to know the
 * backend's raw shape differs from the unified one.
 */
export function normalizeDetectedLine(image, rawLine) {
  return {
    ...rawLine,
    id: lineId(image, rawLine.label),
    image,
    source: "detected",
    deleted: false,
  };
}

/** Builds a new manually-drawn line annotation with the next free M-number for this image. */
export function createManualLine(image, existingLines, x1, y1, x2, y2) {
  const existingLabels = new Set(existingLines.map((l) => l.label));
  const manualCount = existingLines.filter((l) => l.source === "manual").length;
  let n = manualCount + 1;
  let label = `M${n}`;
  while (existingLabels.has(label)) {
    n += 1;
    label = `M${n}`;
  }

  return {
    id: lineId(image, label),
    label,
    image,
    x1,
    y1,
    x2,
    y2,
    source: "manual",
    deleted: false,
  };
}

/** A line is "active" -- usable anywhere downstream (Stage 3+) -- iff it hasn't been deleted. */
export function isActiveLine(line) {
  return !line.deleted;
}

/** Every active line for a given image from Stage 1's temImages list. */
export function activeLinesFor(temImages, image) {
  return (temImages.find((t) => t.image === image)?.lines ?? []).filter(isActiveLine);
}

// ---------------------------------------------------------------------------
// G-vectors (diffraction images) -- same shape/philosophy as lines above.
// The backend's own field names for geometry (ox/oy/tx/ty instead of
// x1/y1/x2/y2, g_id instead of label) are kept as-is rather than renamed,
// since Stage 2/4 already read `g_id`/`hkl` directly and there's no benefit
// to forcing lines and g-vectors into one identical shape. `source` means
// the same thing it does on a line ("detected" | "manual") -- the
// backend's own `source` field (which diffraction image a GVector came
// from) is dropped in favor of `.image`, mirroring a line's `.image`, so
// the two annotation kinds agree on what each shared field name means.
// ---------------------------------------------------------------------------

/** Builds a stable id for a g-vector from its diffraction image + g_id. */
export function gvecId(image, g_id) {
  return `${image}::${g_id}`;
}

/**
 * Normalizes a raw GVector from the backend (g_id/source/ox,oy/tx,ty/vx,vy/
 * length_px/hkl) into the unified shape.
 */
export function normalizeDetectedGVector(image, rawGVector) {
  const { source: _diffImageBasename, ...rest } = rawGVector;
  return {
    ...rest,
    id: gvecId(image, rawGVector.g_id),
    image,
    source: "detected",
    deleted: false,
  };
}

/** Builds a new manually-marked g-vector with the next free id for this diffraction image. */
export function createManualGVector(image, existingGVectors, ox, oy, tx, ty) {
  const existingIds = new Set(existingGVectors.map((g) => g.g_id));
  let n = existingGVectors.length + 1;
  let g_id = `gm${n}`;
  while (existingIds.has(g_id)) {
    n += 1;
    g_id = `gm${n}`;
  }

  return {
    id: gvecId(image, g_id),
    g_id,
    image,
    ox,
    oy,
    tx,
    ty,
    vx: tx - ox,
    vy: ty - oy,
    length_px: Math.hypot(tx - ox, ty - oy),
    hkl: null,
    source: "manual",
    deleted: false,
  };
}

/** A g-vector is "active" -- usable in Stage 2/4 -- iff it hasn't been deleted. */
export function isActiveGVector(gvec) {
  return !gvec.deleted;
}
