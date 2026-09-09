import { useEffect, useState } from "react";
import WorkspaceLayout from "@/components/image/layout/WorkspaceLayout";
import InspectorPanel from "@/components/image/InspectorPanel";
import ImageBrowser from "@/components/image/ImageBrowser";
import ImageToolbar from "@/components/image/ImageToolbar";
import ImageViewport from "@/components/image/ImageViewport";
import OverlayRenderer from "@/components/image/rendering/OverlayRenderer";
import StatusBar from "@/components/image/StatusBar";
import useImageWorkspace from "@/hooks/useImageWorkspace";
import useProjectStore from "@/store/projectStore";
import useLineAnnotations from "@/hooks/useLineAnnotations";
import useGVectorAnnotations from "@/hooks/useGVectorAnnotations";

/**
 * The full Image Workspace. Coordinates the rendering pipeline
 * (`ImageViewport` + `OverlayRenderer`) and the surrounding shell
 * (`WorkspaceLayout`'s sidebar/inspector/status-bar slots), but contains
 * no rendering or layout logic itself -- every actual concern lives in one
 * of the components it composes.
 *
 * `ImageViewport` internally coordinates `CanvasRenderer` and
 * `LayerRenderer` (the transformed, pixel-aligned part of the stack);
 * `OverlayRenderer` is the untransformed screen-space chrome (scale bar,
 * minimap, empty-state message) layered on top, as a sibling rather than
 * nested inside the viewport.
 *
 * Annotation selection and per-image "hidden" state live here, lifted
 * above both `ImageViewport` (which renders the selection highlight and
 * handles click-to-select) and `InspectorPanel` (which lists annotations
 * and lets the user select/hide/delete them from there too) -- their
 * nearest common parent. Both are purely transient view state, not
 * Project Store data: selection has no meaning once you switch images or
 * reload the project, and "hidden" is a declutter preference (see
 * lib/annotations.js's note on why it's kept separate from an
 * annotation's `deleted` flag, which *is* scientific and does live in the
 * store).
 *
 * "Selected annotation" means a line on a TEM image or a g-vector on a
 * diffraction image -- which hook backs it is decided once, here, by the
 * active image's own type, rather than every consumer re-deciding it.
 */
export default function ImageViewer() {
  const { activeImageId, totalImages } = useImageWorkspace();
  const imageType = useProjectStore((state) =>
    activeImageId ? state.project.images.byId[activeImageId]?.type : undefined
  );
  const isDiffraction = imageType === "Diffraction";

  const lineAnnotations = useLineAnnotations(activeImageId);
  const gvectorAnnotations = useGVectorAnnotations(activeImageId);
  const activeAnnotations = isDiffraction ? gvectorAnnotations.activeGVectors : lineAnnotations.activeLines;
  const deleteAnnotation = isDiffraction ? gvectorAnnotations.deleteGVector : lineAnnotations.deleteLine;

  const [selectedLineId, setSelectedLineId] = useState(null);
  const [hiddenByImage, setHiddenByImage] = useState({}); // { [imageId]: Set<annotationId> }

  // Selecting an annotation only makes sense in the image it belongs to.
  useEffect(() => {
    setSelectedLineId(null);
  }, [activeImageId]);

  const hiddenLineIds = hiddenByImage[activeImageId] ?? new Set();

  function toggleHidden(id) {
    setHiddenByImage((prev) => {
      const current = new Set(prev[activeImageId] ?? []);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, [activeImageId]: current };
    });
  }

  function handleDeleteSelected() {
    if (!selectedLineId) return;
    deleteAnnotation(selectedLineId);
    setSelectedLineId(null);
  }

  // Delete/Backspace deletes the selected annotation, whenever one is
  // selected -- matches the toolbar/Inspector delete action (section 6 of
  // the brief: "the Delete key and a toolbar button should both work").
  useEffect(() => {
    function handleKeyDown(e) {
      if (!selectedLineId) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // don't hijack form editing
      e.preventDefault();
      handleDeleteSelected();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLineId, isDiffraction]);

  const selectedLine = activeAnnotations.find((l) => l.id === selectedLineId) ?? null;

  return (
    <WorkspaceLayout
      sidebar={<ImageBrowser />}
      viewer={
        <>
          <ImageToolbar imageId={activeImageId} />
          <div className="relative min-h-0 flex-1">
            <ImageViewport
              imageId={activeImageId}
              selectedLineId={selectedLineId}
              onSelectLine={setSelectedLineId}
              hiddenLineIds={hiddenLineIds}
            />
            <OverlayRenderer imageId={activeImageId} totalImages={totalImages} />
          </div>
        </>
      }
      statusBar={<StatusBar imageId={activeImageId} />}
      inspector={
        <InspectorPanel
          imageId={activeImageId}
          selectedLine={selectedLine}
          onSelectLine={setSelectedLineId}
          hiddenLineIds={hiddenLineIds}
          onToggleHidden={toggleHidden}
          onDeleteSelected={handleDeleteSelected}
        />
      }
    />
  );
}
