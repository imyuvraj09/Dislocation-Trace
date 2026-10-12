import { useEffect, useRef, useState } from "react";
import CanvasRenderer from "@/components/image/rendering/CanvasRenderer";
import LayerRenderer from "@/components/image/rendering/LayerRenderer";
import useProjectStore from "@/store/projectStore";
import useStage from "@/hooks/useStage";
import useViewport from "@/hooks/useViewport";
import useLayers from "@/hooks/useLayers";
import useToolRegistry from "@/hooks/useToolRegistry";
import useLineAnnotations from "@/hooks/useLineAnnotations";
import useGVectorAnnotations from "@/hooks/useGVectorAnnotations";
import { viewportTransform, viewportFilter, screenToImage } from "@/lib/coordinates";

/**
 * The interactive surface -- mouse-wheel zoom, click-drag pan (Pan/Pointer
 * tools), click-to-select (Pointer tool), and click-click two-point
 * annotation drawing -- plus the transformed box that `CanvasRenderer` and
 * `LayerRenderer` paint into.
 *
 * Two annotation tools share the same click-click gesture, routed by the
 * image's own type (never by a separate mode toggle the user has to also
 * set): "Draw Line" commits a manual dislocation line on a TEM image
 * (useLineAnnotations), "Mark G-vector" commits a manual g-vector on a
 * diffraction image (useGVectorAnnotations). Using the wrong tool for the
 * current image's type shows an inline message rather than silently doing
 * nothing.
 *
 * All persistent state (zoom/pan/etc, and the lines/g-vectors themselves)
 * lives in the Project Store. Everything else here -- drag tracking, the
 * in-progress draw gesture, the box's computed pixel size -- is transient
 * interaction state with no reason to survive past the current gesture/
 * layout; selection itself is lifted one level up to `ImageViewer` since
 * `InspectorPanel` needs it too.
 *
 * @param {{
 *   imageId: string|null,
 *   selectedLineId: string|null,
 *   onSelectLine: (id: string|null) => void,
 *   hiddenLineIds: Set<string>,
 * }} props
 */
export default function ImageViewport({ imageId, selectedLineId, onSelectLine, hiddenLineIds }) {
  const stage1 = useStage(1);
  const image = useProjectStore((state) =>
    imageId ? state.project.images.byId[imageId] ?? null : null
  );
  const { viewport, zoomByDelta, pan } = useViewport(imageId);
  const { layersBottomFirst } = useLayers(imageId);
  const { activeToolId } = useToolRegistry();
  const { addLine, updateLineEndpoint, moveLine } = useLineAnnotations(imageId);
  const { addGVector, updateGVectorEndpoint, moveGVector } = useGVectorAnnotations(imageId);

  const [isDragging, setIsDragging] = useState(false);
  const [activeEndpointDrag, setActiveEndpointDrag] = useState(null); // { id, pointIndex }
  const [activeLineDrag, setActiveLineDrag] = useState(null); // { id, startPoint, initialAnnotation }
  const lastPointer = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  const viewportRef = useRef(null);

  const [pendingPoint, setPendingPoint] = useState(null); // {x, y} true image pixels, or null
  const [livePreviewPoint, setLivePreviewPoint] = useState(null); // cursor position while a draw is pending
  const [boxSize, setBoxSize] = useState({ width: 320, height: 256 });

  const isTem = image?.type === "TEM";
  const isDiffraction = image?.type === "Diffraction";
  const drawLineSelected = activeToolId === "draw-line";
  const markGVectorSelected = activeToolId === "mark-gvector";
  const isDrawMode = (drawLineSelected && isTem) || (markGVectorSelected && isDiffraction);
  const wrongToolForImage = (drawLineSelected && isDiffraction) || (markGVectorSelected && isTem);

  // Recompute the content box's pixel size (matching the image's aspect
  // ratio, fit within the available area) whenever the viewport area
  // resizes or a different image (with different dimensions) is selected.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !image?.width || !image?.height) return;

    function recompute() {
      const rect = el.getBoundingClientRect();
      const imageAspect = image.width / image.height;
      const availableAspect = rect.width / rect.height;
      const width = imageAspect > availableAspect ? rect.width : rect.height * imageAspect;
      const height = width / imageAspect;
      setBoxSize({ width, height });
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [image?.width, image?.height]);

  // ESC cancels an in-progress draw (first endpoint placed, second not yet).
  useEffect(() => {
    if (!pendingPoint) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setPendingPoint(null);
        setLivePreviewPoint(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingPoint]);

  // Switching tools or images mid-draw shouldn't leave a dangling pending point.
  useEffect(() => {
    setPendingPoint(null);
    setLivePreviewPoint(null);
  }, [imageId, activeToolId]);

  function handleWheel(e) {
    if (!viewport) return;
    e.preventDefault();
    zoomByDelta(e.deltaY);
  }

  function handleMouseDown(e) {
    if (!viewport) return;
    if (activeToolId === "pan" || (!isDrawMode && !activeEndpointDrag && !activeLineDrag)) {
      setIsDragging(true);
      hasDraggedRef.current = false;
      lastPointer.current = { x: e.clientX, y: e.clientY };
    }
  }

  function handleEndpointMouseDown(e, id, pointIndex) {
    e.stopPropagation();
    setActiveEndpointDrag({ id, pointIndex });
  }

  function handleAnnotationMouseDown(e, id) {
    if (isDrawMode || activeToolId === "pan") return;
    e.stopPropagation();
    onSelectLine?.(id);

    const startPoint = eventToImagePoint(e);
    if (!startPoint || !image) return;

    let initialAnnotation = null;
    if (isTem) {
      const entry = stage1.data.temImages?.find((t) => t.image === image.filename);
      initialAnnotation = entry?.lines?.find((l) => l.id === id);
    } else if (isDiffraction) {
      const entry = stage1.data.diffImages?.find((d) => d.image === image.filename);
      initialAnnotation = entry?.gvecs?.find((g) => g.id === id);
    }

    if (initialAnnotation) {
      setActiveLineDrag({ id, startPoint, initialAnnotation });
    }
  }

  function handleMouseMove(e) {
    if (activeEndpointDrag) {
      const point = eventToImagePoint(e);
      if (point) {
        if (isTem) {
          updateLineEndpoint(activeEndpointDrag.id, activeEndpointDrag.pointIndex, point.x, point.y);
        } else if (isDiffraction) {
          updateGVectorEndpoint(activeEndpointDrag.id, activeEndpointDrag.pointIndex, point.x, point.y);
        }
      }
      return;
    }

    if (activeLineDrag) {
      const point = eventToImagePoint(e);
      if (point) {
        const dx = point.x - activeLineDrag.startPoint.x;
        const dy = point.y - activeLineDrag.startPoint.y;
        hasDraggedRef.current = true;
        if (isTem) {
          moveLine(activeLineDrag.id, dx, dy, activeLineDrag.initialAnnotation);
        } else if (isDiffraction) {
          moveGVector(activeLineDrag.id, dx, dy, activeLineDrag.initialAnnotation);
        }
      }
      return;
    }

    if (isDragging && viewport) {
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasDraggedRef.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      // Only pan when NOT in draw mode — draw mode uses click, not drag.
      if (!isDrawMode) {
        pan(dx, dy);
      }
      return;
    }
    // Live preview: while the first endpoint is placed, track the cursor
    // so the in-progress line/vector renders before the second click commits it.
    if (isDrawMode && pendingPoint) {
      const point = eventToImagePoint(e);
      if (point) setLivePreviewPoint(point);
    }
  }

  function stopDragging() {
    setIsDragging(false);
    setActiveEndpointDrag(null);
    setActiveLineDrag(null);
  }

  /** Converts a click/move event's screen position to true image-pixel coordinates. */
  function eventToImagePoint(e) {
    if (!viewport || !image || !viewportRef.current) return null;

    const viewportRect = viewportRef.current.getBoundingClientRect();
    const boxLeft = viewportRect.left + (viewportRect.width - boxSize.width) / 2;
    const boxTop = viewportRect.top + (viewportRect.height - boxSize.height) / 2;

    const screenPoint = { x: e.clientX - boxLeft, y: e.clientY - boxTop };
    const boxLocalPoint = screenToImage(screenPoint, viewport, boxSize);

    return {
      x: (boxLocalPoint.x / boxSize.width) * image.width,
      y: (boxLocalPoint.y / boxSize.height) * image.height,
    };
  }

  function handleClick(e) {
    if (activeEndpointDrag || activeLineDrag) return;

    if (isDrawMode) {
      if (hasDraggedRef.current) return;
      const point = eventToImagePoint(e);
      if (!point) return;

      if (!pendingPoint) {
        setPendingPoint(point);
        setLivePreviewPoint(point);
      } else {
        if (drawLineSelected) addLine(pendingPoint.x, pendingPoint.y, point.x, point.y);
        else addGVector(pendingPoint.x, pendingPoint.y, point.x, point.y);
        setPendingPoint(null);
        setLivePreviewPoint(null);
      }
      return;
    }

    if (!hasDraggedRef.current) onSelectLine?.(null);
  }

  const cursorClass = activeEndpointDrag || activeLineDrag ? "cursor-move" : isDrawMode ? "cursor-crosshair" : isDragging ? "cursor-grabbing" : "cursor-grab";

  return (
    <div
      ref={viewportRef}
      className={`h-full w-full select-none touch-none ${cursorClass}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDragging}
      onMouseLeave={stopDragging}
      onPointerDown={handleMouseDown}
      onPointerMove={handleMouseMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onClick={handleClick}
    >
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0B1220]">
        {image ? (
          <div
            className="relative shadow-panel transition-transform duration-75 will-change-transform"
            style={{
              width: `${boxSize.width}px`,
              height: `${boxSize.height}px`,
              transform: viewportTransform(viewport),
              filter: viewportFilter(viewport),
            }}
          >
            <CanvasRenderer
              filename={image.filename}
              thumbnail={image.thumbnail}
              src={image.metadata?.src}
              width={image.width}
              height={image.height}
            />
            <LayerRenderer
              layers={layersBottomFirst}
              imageBasename={image.filename}
              imageType={image.type}
              width={image.width}
              height={image.height}
              hiddenLineIds={hiddenLineIds}
              selectedLineId={selectedLineId}
              onAnnotationClick={isDrawMode ? undefined : onSelectLine}
              onAnnotationMouseDown={isDrawMode ? undefined : handleAnnotationMouseDown}
              onEndpointMouseDown={isDrawMode ? undefined : handleEndpointMouseDown}
              pendingPoint={isDrawMode ? pendingPoint : null}
              livePreviewPoint={isDrawMode ? livePreviewPoint : null}
            />
          </div>
        ) : (
          <p className="text-sm text-subtle">No image selected.</p>
        )}
      </div>
      {isDrawMode && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-ink/80 px-3 py-1 text-xs text-white/90">
          {pendingPoint ? "Click the second point (Esc to cancel)" : "Click the first point"}
        </p>
      )}
      {wrongToolForImage && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-warn/90 px-3 py-1 text-xs text-white">
          {drawLineSelected
            ? "Draw Line only applies to TEM images -- switch to a TEM image, or use Mark G-vector here."
            : "Mark G-vector only applies to diffraction images -- switch to a diffraction image, or use Draw Line here."}
        </p>
      )}
    </div>
  );
}
