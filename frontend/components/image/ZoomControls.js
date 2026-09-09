/**
 * Presentational zoom control -- zoom out / percentage / zoom in.
 *
 * Deliberately takes plain values and callbacks rather than an imageId, so
 * it's reusable wherever a zoom affordance is needed without depending on
 * the Project Store itself. Rendered today as the "zoom" widget-kind tool
 * in the Tool Registry (see constants/tools.js); "Fit to screen" is its
 * own separate action-kind tool rather than living inside this control.
 */
export default function ZoomControls({ zoom, onZoomIn, onZoomOut }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-line bg-surface p-1">
      <button
        type="button"
        onClick={onZoomOut}
        className="flex h-7 w-7 items-center justify-center rounded text-ink hover:bg-surfaceAlt"
        aria-label="Zoom out"
      >
        −
      </button>
      <span className="w-12 text-center font-mono text-xs text-muted">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        className="flex h-7 w-7 items-center justify-center rounded text-ink hover:bg-surfaceAlt"
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  );
}
