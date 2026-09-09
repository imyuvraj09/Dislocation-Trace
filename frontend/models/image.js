import { DEFAULT_LAYER_DEFS, categoryToType } from "@/constants/imageWorkspace";
import { createLayer } from "@/models/layer";

/**
 * The Image model.
 *
 * Phase 2 formalized images into an entity carrying a viewport and a layer
 * stack. This stabilization pass extends it into a longer-term scientific
 * image representation -- adding a filesystem path (for the eventual
 * Electron shell), calibration (real-world scale), statistics (intensity
 * summary), and a cache bucket for derived/expensive-to-recompute data --
 * without implementing any of the backend work that would populate them.
 * Every new field defaults to `null` (or a null-filled sub-object) until
 * something real can supply it; see ScaleBar.js and Histogram.js for the
 * two places that already prefer real data over their placeholders when
 * it's present.
 *
 * @typedef {Object} Viewport
 * @property {number} zoom          1 = 100%.
 * @property {number} panX          Pixels, relative to the viewport's own center.
 * @property {number} panY
 * @property {number} rotation      Degrees, typically a multiple of 90.
 * @property {number} brightness    -100..100, 0 = unchanged.
 * @property {number} contrast      -100..100, 0 = unchanged.
 * @property {boolean} fitToScreen  Whether "fit to screen" is the active zoom mode.
 *
 * @typedef {Object} Calibration
 * @property {number|null} nmPerPixel  Real-world scale. Null until a calibration step exists.
 * @property {string} unit             Always "nm" for now; kept as a field rather than a hardcoded assumption.
 * @property {string|null} source      Where the calibration came from (e.g. "manual", "microscope-metadata"). Null until one exists.
 * @property {string|null} calibratedAt ISO timestamp of when calibration was set.
 *
 * @typedef {Object} Statistics
 * @property {number|null} min
 * @property {number|null} max
 * @property {number|null} mean
 * @property {number|null} stdDev
 * @property {number[]|null} histogram  Precomputed bin heights, when a backend has supplied them.
 * @property {string|null} computedAt   ISO timestamp of when statistics were computed.
 *
 * @typedef {Object} ImageCache
 * @property {string|null} decodedAt      ISO timestamp of when pixel data was last decoded, if ever.
 * @property {number|null} naturalWidth   The decoded bitmap's actual width, once one exists (may differ from `width`, which can be metadata-only).
 * @property {number|null} naturalHeight
 *
 * @typedef {Object} ImageEntity
 * @property {string} id
 * @property {string} filename
 * @property {string|null} path   Filesystem path, once there's an Electron shell to read one from. Null in-browser.
 * @property {string} type        "TEM" | "Diffraction" | "Output"
 * @property {number} width
 * @property {number} height
 * @property {string|null} thumbnail  Data URL or object URL, when one exists. No image processing/generation
 *   happens here, so this is null unless the caller supplies a real one.
 * @property {Object} metadata    Free-form (uploadedAt, source category, anything a later phase adds).
 * @property {Calibration} calibration
 * @property {Statistics} statistics
 * @property {ImageCache} cache
 * @property {Viewport} viewport
 * @property {import("@/models/layer").Layer[]} layers
 */

/** A fresh, default viewport: 100% zoom, centered, no rotation/adjustment, fit-to-screen on. */
export function createDefaultViewport() {
  return {
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    brightness: 0,
    contrast: 0,
    fitToScreen: true,
  };
}

/** A fresh copy of the default 5-layer stack (Base / Detection / Annotation / Measurement / Label). */
export function createDefaultLayers() {
  return DEFAULT_LAYER_DEFS.map((def, index) =>
    createLayer({ id: def.id, type: def.type, name: def.name, locked: def.locked, zIndex: index })
  );
}

/** No calibration yet -- everything null until a real calibration step exists. */
export function createDefaultCalibration() {
  return { nmPerPixel: null, unit: "nm", source: null, calibratedAt: null };
}

/** No computed statistics yet -- everything null until a backend can compute them. */
export function createDefaultStatistics() {
  return { min: null, max: null, mean: null, stdDev: null, histogram: null, computedAt: null };
}

/** No cached derived data yet. */
export function createDefaultCache() {
  return { decodedAt: null, naturalWidth: null, naturalHeight: null };
}

/**
 * Builds a full Image entity from a raw record (an uploaded File's
 * metadata, or a mock/real API image record) plus the category it's being
 * registered under. Any of calibration/statistics/cache/path/thumbnail the
 * source already carries are preserved; anything missing defaults to null
 * (never left `undefined`).
 *
 * @param {{id: string, filename?: string, name?: string, path?: string, type?: string, width?: number, height?: number, thumbnail?: string|null, metadata?: Object, calibration?: Object, statistics?: Object, cache?: Object}} source
 * @param {string} category one of constants/imageWorkspace.js's IMAGE_CATEGORIES
 * @returns {ImageEntity}
 */
export function createImage(source, category) {
  return {
    id: source.id,
    filename: source.filename ?? source.name ?? "untitled",
    path: source.path ?? null,
    type: source.type ?? categoryToType(category),
    width: source.width ?? 0,
    height: source.height ?? 0,
    thumbnail: source.thumbnail ?? null,
    metadata: {
      uploadedAt: source.uploadedAt ?? null,
      category,
      ...(source.metadata ?? {}),
    },
    calibration: source.calibration ?? createDefaultCalibration(),
    statistics: source.statistics ?? createDefaultStatistics(),
    cache: source.cache ?? createDefaultCache(),
    viewport: createDefaultViewport(),
    layers: createDefaultLayers(),
  };
}
