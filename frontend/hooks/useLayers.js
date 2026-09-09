import { useCallback, useMemo } from "react";
import useProjectStore from "@/store/projectStore";

/**
 * The layer stack (Base / Detection / Annotation / Measurement / Label) for
 * a single image. Backs LayerManager and feeds LayerRenderer's paint order.
 *
 * Performance note: `image.layers` keeps the same array reference across
 * viewport-only updates (pan/zoom/rotate/brightness/contrast) -- the store
 * only replaces the `viewport` key on those actions (see
 * store/projectStore.js's updateImageViewport). The `useMemo` calls below
 * key off that same reference, so panning/zooming an image doesn't produce
 * new `layers`/`layersBottomFirst` arrays -- which in turn lets
 * LayerRenderer's `React.memo` actually skip re-rendering during a drag,
 * instead of recomputing on every mouse-move tick.
 *
 * @param {string|null} imageId
 */
export function useLayers(imageId) {
  const image = useProjectStore((state) => (imageId ? state.project.images.byId[imageId] : null));
  const setLayerProperty = useProjectStore((state) => state.setLayerProperty);
  const reorderLayers = useProjectStore((state) => state.reorderLayers);

  const layers = image?.layers ?? [];

  // Bottom-to-top storage order, reversed for a top-to-bottom layer panel
  // (the usual "topmost layer listed first" convention).
  const orderedTopFirst = useMemo(
    () => [...layers].sort((a, b) => b.zIndex - a.zIndex),
    [layers]
  );
  const layersBottomFirst = useMemo(
    () => [...layers].sort((a, b) => a.zIndex - b.zIndex),
    [layers]
  );

  const toggleVisibility = useCallback(
    (layerId) => {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || layer.locked) return;
      setLayerProperty(imageId, layerId, { visible: !layer.visible });
    },
    [imageId, layers, setLayerProperty]
  );

  const toggleLock = useCallback(
    (layerId) => {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer) return;
      // In practice this only ever unlocks/relocks non-Base layers -- Base
      // Image is intentionally always locked (see models/image.js).
      setLayerProperty(imageId, layerId, { locked: !layer.locked });
    },
    [imageId, layers, setLayerProperty]
  );

  /** Moves a layer up or down one position in the (top-first) panel list. */
  const moveLayer = useCallback(
    (layerId, direction) => {
      const index = orderedTopFirst.findIndex((l) => l.id === layerId);
      const targetIndex = index + (direction === "up" ? -1 : 1);
      if (index === -1 || targetIndex < 0 || targetIndex >= orderedTopFirst.length) return;

      const reordered = [...orderedTopFirst];
      [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
      // reorderLayers expects bottom-to-top ids.
      reorderLayers(imageId, [...reordered].reverse().map((l) => l.id));
    },
    [imageId, orderedTopFirst, reorderLayers]
  );

  return {
    /** Top-to-bottom, for a layer panel. */
    layers: orderedTopFirst,
    /** Bottom-to-top, for LayerRenderer's paint order (base first). */
    layersBottomFirst,
    toggleVisibility,
    toggleLock,
    moveLayer,
  };
}

export default useLayers;
