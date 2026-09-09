import ScaleBar from "@/components/image/ScaleBar";
import MiniMap from "@/components/image/MiniMap";

/**
 * Screen-space chrome layered on top of the (zoom/pan/rotate-transformed)
 * canvas + layer stack: the scale bar, minimap, and empty-state messaging
 * today. Deliberately NOT inside the transformed box `ImageViewport`
 * renders `CanvasRenderer`/`LayerRenderer` into -- none of this should
 * move, scale, or rotate with the image the way layer content does.
 *
 * This is also the seam Phase 3's annotation tool chrome (selection
 * handles, in-progress-drawing feedback, a crosshair cursor) attaches to:
 * anything that needs to track the mouse in screen space rather than
 * paint into image space belongs here, not in `LayerRenderer`.
 *
 * @param {{imageId: string|null, totalImages: number}} props
 */
export default function OverlayRenderer({ imageId, totalImages }) {
  return (
    <>
      {totalImages === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-white/60">
          Run Stage 1 (Image Detection) to populate the workspace.
        </div>
      )}
      <div className="absolute bottom-3 left-3">
        <ScaleBar imageId={imageId} />
      </div>
      <div className="absolute right-3 top-3">
        <MiniMap imageId={imageId} />
      </div>
    </>
  );
}
