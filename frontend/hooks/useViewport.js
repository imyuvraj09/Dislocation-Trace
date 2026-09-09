import { useCallback } from "react";
import useProjectStore from "@/store/projectStore";
import { VIEWPORT_LIMITS } from "@/constants/imageWorkspace";

const { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, ROTATE_STEP_DEG, MIN_ROTATION = -360, MAX_ROTATION = 360, MIN_BRIGHTNESS, MAX_BRIGHTNESS, MIN_CONTRAST, MAX_CONTRAST, ADJUSTMENT_STEP } =
  VIEWPORT_LIMITS;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Viewport controls (zoom / pan / rotate / fit-to-screen / reset / brightness /
 * contrast) for a single image, persisted on `project.images.byId[imageId].viewport`.
 *
 * Per the Phase 2 brief, viewport state is never local `useState` -- every
 * action here is a Project Store mutation, so switching away from an image
 * and back (or reloading a saved project) leaves its viewport exactly as
 * the user left it.
 *
 * @param {string|null} imageId
 */
export function useViewport(imageId) {
  const image = useProjectStore((state) => (imageId ? state.project.images.byId[imageId] : null));
  const updateImageViewport = useProjectStore((state) => state.updateImageViewport);
  const resetImageViewport = useProjectStore((state) => state.resetImageViewport);

  const viewport = image?.viewport ?? null;

  const update = useCallback(
    (partial) => imageId && updateImageViewport(imageId, partial),
    [imageId, updateImageViewport]
  );

  const setZoom = useCallback(
    (zoom) => update({ zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM), fitToScreen: false }),
    [update]
  );

  const zoomIn = useCallback(() => viewport && setZoom(viewport.zoom + ZOOM_STEP), [viewport, setZoom]);
  const zoomOut = useCallback(() => viewport && setZoom(viewport.zoom - ZOOM_STEP), [viewport, setZoom]);

  /** Mouse-wheel zoom, keyed off wheel delta rather than the fixed toolbar step. */
  const zoomByDelta = useCallback(
    (delta) => viewport && setZoom(viewport.zoom - delta * VIEWPORT_LIMITS.WHEEL_ZOOM_SENSITIVITY),
    [viewport, setZoom]
  );

  const pan = useCallback(
    (dx, dy) => viewport && update({ panX: viewport.panX + dx, panY: viewport.panY + dy, fitToScreen: false }),
    [viewport, update]
  );

  const fitToScreen = useCallback(
    () => update({ zoom: 1, panX: 0, panY: 0, fitToScreen: true }),
    [update]
  );

  const resetView = useCallback(() => imageId && resetImageViewport(imageId), [imageId, resetImageViewport]);

  const setRotation = useCallback(
    (value) => update({ rotation: clamp(value, MIN_ROTATION, MAX_ROTATION) }),
    [update]
  );

  const rotate = useCallback(() => {
    if (!viewport) return;
    const next = viewport.rotation >= 360 ? 90 : viewport.rotation + ROTATE_STEP_DEG;
    setRotation(next);
  }, [viewport, setRotation]);

  const setBrightness = useCallback(
    (value) => update({ brightness: clamp(value, MIN_BRIGHTNESS, MAX_BRIGHTNESS) }),
    [update]
  );

  const setContrast = useCallback(
    (value) => update({ contrast: clamp(value, MIN_CONTRAST, MAX_CONTRAST) }),
    [update]
  );

  return {
    viewport,
    setZoom,
    zoomIn,
    zoomOut,
    zoomByDelta,
    pan,
    fitToScreen,
    resetView,
    rotate,
    setRotation,
    setBrightness,
    setContrast,
    adjustmentStep: ADJUSTMENT_STEP,
  };
}

export default useViewport;
