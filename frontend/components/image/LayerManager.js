import useLayers from "@/hooks/useLayers";

const LAYER_HINT = {
  base: "The source micrograph. Always visible, can't be reordered.",
  detection: "Auto-detected dislocation lines (TEM) or g-vectors (diffraction) from Stage 1.",
  annotation: "User-drawn lines/g-vectors (Draw Line / Mark G-vector tools). Editable/removable below.",
  measurement: "Reserved for line/angle measurement tools (a future phase).",
  label: "Reserved for text/callout labels (a future phase).",
};

/**
 * Layer stack panel: visibility, lock, and reordering for one image's five
 * layers (Base / Detection / Annotation / Measurement / Label).
 *
 * Detection and Annotation now render real content (see
 * rendering/LayerRenderer.js) -- Measurement and Label remain placeholders.
 * This component's own job is unchanged: make the *stack itself* (order,
 * visibility, locking) real and reusable.
 *
 * @param {{imageId: string|null}} props
 */
export default function LayerManager({ imageId }) {
  const { layers, toggleVisibility, toggleLock, moveLayer } = useLayers(imageId);

  if (!imageId || layers.length === 0) {
    return <p className="px-3 py-4 text-xs text-subtle">No image selected.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {layers.map((layer, index) => (
        <li key={layer.id} className="flex items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={() => toggleVisibility(layer.id)}
            disabled={layer.locked}
            aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
            className="flex h-6 w-6 items-center justify-center rounded text-sm text-muted hover:bg-surfaceAlt disabled:opacity-40"
            title={layer.locked ? "Locked" : layer.visible ? "Visible" : "Hidden"}
          >
            {layer.visible ? "👁" : "—"}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink">{layer.name}</p>
            <p className="truncate text-[11px] text-subtle">{LAYER_HINT[layer.type]}</p>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => moveLayer(layer.id, "up")}
              disabled={layer.locked || index === 0}
              aria-label={`Move ${layer.name} up`}
              className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted hover:bg-surfaceAlt disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => moveLayer(layer.id, "down")}
              disabled={layer.locked || index === layers.length - 1}
              aria-label={`Move ${layer.name} down`}
              className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted hover:bg-surfaceAlt disabled:opacity-30"
            >
              ▼
            </button>
          </div>

          <button
            type="button"
            onClick={() => toggleLock(layer.id)}
            disabled={layer.type === "base"}
            aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
            className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted hover:bg-surfaceAlt disabled:opacity-30"
          >
            {layer.locked ? "🔒" : "🔓"}
          </button>
        </li>
      ))}
    </ul>
  );
}
