import useProjectStore from "@/store/projectStore";

const MAP_SIZE = 96;

/**
 * A small always-visible overview tile showing roughly where the current
 * viewport's zoom/pan sits relative to the whole image. This is a
 * navigational aid, not a rendering of real pixel content -- Phase 2 does
 * no image processing, so it draws a placeholder tile with a highlighted
 * viewport rectangle rather than a scaled-down copy of actual image data.
 *
 * @param {{imageId: string|null}} props
 */
export default function MiniMap({ imageId }) {
  const image = useProjectStore((state) =>
    imageId ? state.project.images.byId[imageId] ?? null : null
  );

  if (!image) return null;

  const { viewport } = image;
  // A simple, readable approximation of "how much of the image is visible
  // at this zoom": the box shrinks as zoom increases, and shifts opposite
  // to pan (panning right moves the visible window left within the map).
  const boxSize = Math.min(MAP_SIZE, MAP_SIZE / Math.max(viewport.zoom, 0.25));
  const offsetX = Math.max(
    0,
    Math.min(MAP_SIZE - boxSize, MAP_SIZE / 2 - boxSize / 2 - viewport.panX / 8)
  );
  const offsetY = Math.max(
    0,
    Math.min(MAP_SIZE - boxSize, MAP_SIZE / 2 - boxSize / 2 - viewport.panY / 8)
  );

  return (
    <div
      className="relative overflow-hidden rounded-md border border-line bg-gradient-to-br from-zone-600/30 via-ink to-beam-600/20"
      style={{ width: MAP_SIZE, height: MAP_SIZE }}
      aria-label="Viewport overview"
    >
      <div
        className="absolute rounded-sm border-2 border-beam-300"
        style={{ width: boxSize, height: boxSize, left: offsetX, top: offsetY }}
      />
    </div>
  );
}
