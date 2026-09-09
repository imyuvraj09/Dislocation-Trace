import LayerManager from "@/components/image/LayerManager";
import Histogram from "@/components/image/Histogram";
import useProjectStore from "@/store/projectStore";
import useStage from "@/hooks/useStage";
import useLineAnnotations from "@/hooks/useLineAnnotations";
import useGVectorAnnotations from "@/hooks/useGVectorAnnotations";

const SOURCE_LABEL = { detected: "Detected", manual: "Manual" };

/**
 * The right-hand Inspector Panel: layer stack, the full annotation list
 * (select/hide/delete/restore), and histogram for the selected image.
 *
 * The annotation list is the same unified collection `ImageViewport`/
 * `LayerRenderer` draw from -- lines (`project.stages[1].temImages`) for a
 * TEM image, g-vectors (`project.stages[1].diffImages`) for a diffraction
 * image, detected and manual side by side, told apart only by a
 * "Detected"/"Manual" tag. A g-vector's row also shows its Miller index
 * once Stage 2 has assigned one. Selecting a row here highlights the same
 * annotation on the canvas (and vice versa) since both read/write the
 * same `selectedLine`/`onSelectLine` lifted in `ImageViewer`.
 *
 * @param {{
 *   imageId: string|null,
 *   selectedLine: object|null,
 *   onSelectLine: (id: string|null) => void,
 *   hiddenLineIds: Set<string>,
 *   onToggleHidden: (id: string) => void,
 *   onDeleteSelected: () => void,
 * }} props
 */
export default function InspectorPanel({
  imageId,
  selectedLine,
  onSelectLine,
  hiddenLineIds,
  onToggleHidden,
  onDeleteSelected,
}) {
  const imageType = useProjectStore((state) => (imageId ? state.project.images.byId[imageId]?.type : undefined));
  const isDiffraction = imageType === "Diffraction";

  const lineAnnotations = useLineAnnotations(imageId);
  const gvectorAnnotations = useGVectorAnnotations(imageId);
  const millerByGId = useStage(2).data.millerIndexByGvector?.[imageId] ?? {};

  const active = isDiffraction ? gvectorAnnotations.activeGVectors : lineAnnotations.activeLines;
  const deleted = isDiffraction ? gvectorAnnotations.deletedGVectors : lineAnnotations.deletedLines;
  const deleteItem = isDiffraction ? gvectorAnnotations.deleteGVector : lineAnnotations.deleteLine;
  const restoreItem = isDiffraction ? gvectorAnnotations.restoreGVector : lineAnnotations.restoreLine;
  const sectionLabel = isDiffraction ? "G-vectors" : "Lines";
  const emptyHint = isDiffraction
    ? "None yet -- run Stage 1 detection, or select the Mark G-vector tool and click origin then tip."
    : "None yet -- run Stage 1 detection, or select the Draw Line tool and click two points.";

  function labelFor(item) {
    if (!isDiffraction) return item.label;
    const hkl = millerByGId[item.g_id];
    return hkl ? `${item.g_id} [${hkl.join(" ")}]` : item.g_id;
  }

  return (
    <>
      <div>
        <h3 className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-subtle">
          Layers
        </h3>
        <LayerManager imageId={imageId} />
      </div>

      <div>
        <div className="flex items-center justify-between px-3 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">{sectionLabel}</h3>
          {selectedLine && (
            <button
              type="button"
              onClick={onDeleteSelected}
              className="text-xs font-medium text-err hover:underline"
              title="Delete (or press Delete/Backspace)"
            >
              Delete selected
            </button>
          )}
        </div>

        {active.length === 0 ? (
          <p className="px-3 py-2 text-xs text-subtle">{emptyHint}</p>
        ) : (
          <ul className="divide-y divide-line px-3">
            {active.map((item) => {
              const isSelected = selectedLine?.id === item.id;
              const isHidden = hiddenLineIds.has(item.id);
              return (
                <li
                  key={item.id}
                  onClick={() => onSelectLine(isSelected ? null : item.id)}
                  className={`flex cursor-pointer items-center justify-between gap-2 py-2 ${
                    isSelected ? "bg-beam-50" : "hover:bg-surfaceAlt"
                  }`}
                >
                  <span className="flex items-center gap-2 pl-1">
                    <span className="font-mono text-sm text-ink">{labelFor(item)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-subtle">
                      {SOURCE_LABEL[item.source] ?? item.source}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 pr-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleHidden(item.id);
                      }}
                      className="text-xs font-medium text-muted hover:underline"
                    >
                      {isHidden ? "Show" : "Hide"}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteItem(item.id);
                        if (isSelected) onSelectLine(null);
                      }}
                      className="text-xs font-medium text-err hover:underline"
                    >
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {deleted.length > 0 && (
          <div className="mt-2 border-t border-line px-3 pt-2">
            <p className="text-[10px] uppercase tracking-wide text-subtle">Deleted ({deleted.length})</p>
            <ul className="divide-y divide-line">
              {deleted.map((item) => (
                <li key={item.id} className="flex items-center justify-between py-1.5">
                  <span className="font-mono text-sm text-subtle line-through">{labelFor(item)}</span>
                  <button
                    type="button"
                    onClick={() => restoreItem(item.id)}
                    className="text-xs font-medium text-beam-600 hover:underline"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <h3 className="px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-subtle">
          Histogram
        </h3>
        <Histogram imageId={imageId} />
      </div>
    </>
  );
}
