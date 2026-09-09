/**
 * Coordinate-conversion utilities between screen space (pixels, relative
 * to the viewport element's own top-left corner) and image space (pixels,
 * relative to the un-transformed image content's own top-left corner --
 * i.e. unaffected by the current zoom/pan/rotation).
 *
 * These are the ONLY sanctioned way to convert between the two spaces or
 * to build a viewport's CSS transform/filter strings. `ImageViewport`
 * already uses `viewportTransform`/`viewportFilter` for its own rendering
 * (replacing what used to be inline template literals); Phase 3's
 * annotation tools should use `screenToImage`/`imageToScreen` for turning
 * a mouse event into an image-space coordinate (and back), rather than
 * re-deriving this math ad hoc. Keeping every conversion routed through
 * one module means there is exactly one place to get the rotation/zoom
 * math right as it gets more elaborate.
 *
 * All functions here are pure and framework-agnostic -- no React, no
 * store access -- so they're usable from components, hooks, or plain
 * event handlers alike.
 */

/** Builds the CSS `transform` string for a viewport's pan/zoom/rotation. */
export function viewportTransform(viewport) {
  if (!viewport) return "none";
  const { panX, panY, zoom, rotation } = viewport;
  return `translate(${panX}px, ${panY}px) scale(${zoom}) rotate(${rotation}deg)`;
}

/** Builds the CSS `filter` string for a viewport's brightness/contrast. */
export function viewportFilter(viewport) {
  if (!viewport) return "none";
  const { brightness, contrast } = viewport;
  return `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})`;
}

/**
 * The inverse of a viewport's transform parameters -- negated pan,
 * reciprocal zoom, negated rotation. Applying `viewportTransform` and then
 * `inverseViewportTransform` composes to the identity; `screenToImage`
 * uses this to walk a screen-space point back to image space.
 * @returns {{panX:number, panY:number, zoom:number, rotation:number}|null}
 */
export function inverseViewportTransform(viewport) {
  if (!viewport) return null;
  return {
    panX: -viewport.panX,
    panY: -viewport.panY,
    zoom: 1 / viewport.zoom,
    rotation: -viewport.rotation,
  };
}

export function rotateVector(vx, vy, degrees) {
  if (!degrees) return { vx, vy };
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    vx: vx * cos - vy * sin,
    vy: vx * sin + vy * cos,
  };
}

function rotatePoint(point, degrees) {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

/**
 * Converts a point from screen space (pixels, relative to the viewport
 * container's top-left corner) to image space (pixels, relative to the
 * un-transformed image content's own top-left corner) -- inverting pan,
 * then centering, then zoom, then rotation, matching the CSS
 * `transform: translate(...) scale(...) rotate(...)` applied (about the
 * element's center) in `viewportTransform`.
 *
 * @param {{x:number, y:number}} point
 * @param {import("@/models/image").Viewport} viewport
 * @param {{width:number, height:number}} containerSize The rendered pixel size of the
 *   (untransformed) image content box -- e.g. from a `getBoundingClientRect()` on its wrapper.
 * @returns {{x:number, y:number}}
 */
export function screenToImage(point, viewport, containerSize) {
  if (!viewport || !containerSize) return point;
  const center = { x: containerSize.width / 2, y: containerSize.height / 2 };

  let p = { x: point.x - viewport.panX, y: point.y - viewport.panY };
  p = { x: p.x - center.x, y: p.y - center.y };
  p = { x: p.x / viewport.zoom, y: p.y / viewport.zoom };
  p = rotatePoint(p, -viewport.rotation);
  return { x: p.x + center.x, y: p.y + center.y };
}

/**
 * The inverse of {@link screenToImage}: converts an image-space point back
 * to screen space (rotate, then zoom, then re-center, then pan).
 *
 * @param {{x:number, y:number}} point
 * @param {import("@/models/image").Viewport} viewport
 * @param {{width:number, height:number}} containerSize
 * @returns {{x:number, y:number}}
 */
export function imageToScreen(point, viewport, containerSize) {
  if (!viewport || !containerSize) return point;
  const center = { x: containerSize.width / 2, y: containerSize.height / 2 };

  let p = { x: point.x - center.x, y: point.y - center.y };
  p = rotatePoint(p, viewport.rotation);
  p = { x: p.x * viewport.zoom, y: p.y * viewport.zoom };
  p = { x: p.x + center.x, y: p.y + center.y };
  return { x: p.x + viewport.panX, y: p.y + viewport.panY };
}
