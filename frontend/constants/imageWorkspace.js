/**
 * Static configuration for the Phase 2 Image Workspace.
 *
 * Mirrors the pattern set by constants/pipeline.js: this is the single
 * source of truth for category keys/labels, layer definitions, and
 * viewport numeric ranges, so components/models/store never hardcode them
 * in more than one place.
 */

/** The three image categories the Image Browser groups by. */
export const IMAGE_CATEGORIES = {
  TEM: "tem",
  DIFFRACTION: "diffraction",
  OUTPUT: "output",
};

export const IMAGE_CATEGORY_ORDER = [
  IMAGE_CATEGORIES.TEM,
  IMAGE_CATEGORIES.DIFFRACTION,
  IMAGE_CATEGORIES.OUTPUT,
];

export const IMAGE_CATEGORY_LABELS = {
  [IMAGE_CATEGORIES.TEM]: "TEM Images",
  [IMAGE_CATEGORIES.DIFFRACTION]: "Diffraction Images",
  [IMAGE_CATEGORIES.OUTPUT]: "Output Images",
};

/** Maps a raw image record's `type` field (e.g. from lib/mockData.js) to a browser category. */
export function typeToCategory(type) {
  const normalized = (type || "").toLowerCase();
  if (normalized === "tem") return IMAGE_CATEGORIES.TEM;
  if (normalized === "diffraction") return IMAGE_CATEGORIES.DIFFRACTION;
  return IMAGE_CATEGORIES.OUTPUT;
}

export function categoryToType(category) {
  if (category === IMAGE_CATEGORIES.TEM) return "TEM";
  if (category === IMAGE_CATEGORIES.DIFFRACTION) return "Diffraction";
  return "Output";
}

/**
 * The five layer types every image gets by default. Only "base" and
 * "detection" have any real content so far -- annotation, measurement,
 * and label are placeholders reserved for later phases, present now so
 * the layer stack (ordering, visibility, locking) doesn't need another
 * migration once those tools exist.
 */
export const LAYER_TYPES = {
  BASE: "base",
  DETECTION: "detection",
  ANNOTATION: "annotation",
  MEASUREMENT: "measurement",
  LABEL: "label",
};

/** Ordered bottom-to-top default layer stack for a newly-registered image. Fed through models/layer.js's createLayer(). */
export const DEFAULT_LAYER_DEFS = [
  { id: LAYER_TYPES.BASE, type: LAYER_TYPES.BASE, name: "Base Image", locked: true },
  { id: LAYER_TYPES.DETECTION, type: LAYER_TYPES.DETECTION, name: "Detection Layer", locked: false },
  { id: LAYER_TYPES.ANNOTATION, type: LAYER_TYPES.ANNOTATION, name: "Annotation Layer", locked: false },
  { id: LAYER_TYPES.MEASUREMENT, type: LAYER_TYPES.MEASUREMENT, name: "Measurement Layer", locked: false },
  { id: LAYER_TYPES.LABEL, type: LAYER_TYPES.LABEL, name: "Label Layer", locked: false },
];

/** Viewport numeric ranges/steps, shared by ZoomControls, ImageToolbar, and ImageViewport's wheel handler. */
export const VIEWPORT_LIMITS = {
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 8,
  ZOOM_STEP: 0.25,
  WHEEL_ZOOM_SENSITIVITY: 0.0015,
  ROTATE_STEP_DEG: 90,
  MIN_ROTATION: -360,
  MAX_ROTATION: 360,
  MIN_BRIGHTNESS: -100,
  MAX_BRIGHTNESS: 100,
  MIN_CONTRAST: -100,
  MAX_CONTRAST: 100,
  ADJUSTMENT_STEP: 5,
};
