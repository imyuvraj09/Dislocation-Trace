import ZoomControls from "@/components/image/ZoomControls";
import useViewport from "@/hooks/useViewport";
import useToolRegistry from "@/hooks/useToolRegistry";
import { TOOL_KIND } from "@/constants/tools";

/**
 * The main viewport toolbar, rendered dynamically from the Tool Registry
 * (services/toolRegistry.js) rather than a hardcoded list of buttons.
 *
 * The registry itself only knows a tool's id/label/icon/kind/order -- it
 * has no idea what a tool actually *does*. Binding a registered tool to a
 * real action is this component's job: `ACTIONS`/`VALUES`/`SETTERS` below
 * map a tool id to the `useViewport` function it should call. Phase 3's
 * annotation tools register into the same list (so they show up here
 * automatically) and would extend these maps with their own ids -- no
 * change to the render loop itself required, as long as their `kind` is
 * one of `TOOL_KIND`'s variants.
 *
 * @param {{imageId: string|null}} props
 */
export default function ImageToolbar({ imageId }) {
  const { tools, activeToolId, setActiveToolId } = useToolRegistry();
  const {
    viewport,
    zoomIn,
    zoomOut,
    fitToScreen,
    resetView,
    rotate,
    setRotation,
    setBrightness,
    setContrast,
    adjustmentStep,
  } = useViewport(imageId);

  const disabled = !viewport;

  const ACTIONS = { fit: fitToScreen, reset: resetView, rotate };
  const VALUES = {
    brightness: viewport?.brightness ?? 0,
    contrast: viewport?.contrast ?? 0,
    rotation: viewport?.rotation ?? 0,
  };
  const SETTERS = {
    brightness: setBrightness,
    contrast: setContrast,
    rotation: setRotation,
  };
  // Tool ids that should get a visual divider before them, grouping the
  // toolbar into: [mode buttons] | [zoom/fit/reset/rotate] | [sliders].
  const DIVIDER_BEFORE = new Set(["zoom", "rotation", "brightness"]);

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 border-b border-line bg-surface px-3 sm:px-4 py-2 sm:py-2.5">
      {tools.map((tool) => (
        <ToolEntry
          key={tool.id}
          tool={tool}
          isActive={activeToolId === tool.id}
          disabled={disabled}
          divider={DIVIDER_BEFORE.has(tool.id)}
          onSelect={() => setActiveToolId(tool.id)}
          onAction={ACTIONS[tool.id]}
          value={VALUES[tool.id]}
          onChange={SETTERS[tool.id]}
          step={adjustmentStep}
          zoom={viewport?.zoom ?? 1}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
        />
      ))}
    </div>
  );
}

function ToolEntry({
  tool,
  isActive,
  disabled,
  divider,
  onSelect,
  onAction,
  value,
  onChange,
  step,
  zoom,
  onZoomIn,
  onZoomOut,
}) {
  const dividerEl = divider ? <div className="mx-0.5 sm:mx-1 h-4 w-px bg-line" /> : null;

  if (tool.kind === TOOL_KIND.WIDGET && tool.id === "zoom") {
    return (
      <>
        {dividerEl}
        <ZoomControls zoom={zoom} onZoomIn={onZoomIn} onZoomOut={onZoomOut} />
      </>
    );
  }

  if (tool.kind === TOOL_KIND.SLIDER) {
    return (
      <>
        {dividerEl}
        <AdjustmentSlider
          label={tool.label}
          value={value ?? 0}
          min={tool.min ?? -100}
          max={tool.max ?? 100}
          step={tool.step ?? step}
          unit={tool.unit ?? ""}
          disabled={disabled}
          onChange={onChange}
        />
      </>
    );
  }

  if (tool.kind === TOOL_KIND.MODE) {
    return (
      <>
        {dividerEl}
        <button
          type="button"
          onClick={onSelect}
          disabled={disabled}
          aria-pressed={isActive}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium min-h-[36px] sm:min-h-[32px] disabled:opacity-40 ${
            isActive ? "bg-beam-50 text-beam-700" : "text-muted hover:bg-surfaceAlt"
          }`}
        >
          <span aria-hidden>{tool.icon}</span> {tool.label}
        </button>
      </>
    );
  }

  // TOOL_KIND.ACTION
  return (
    <>
      {dividerEl}
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surfaceAlt disabled:opacity-40 min-h-[36px] sm:min-h-[32px]"
      >
        <span aria-hidden>{tool.icon}</span> {tool.label}
      </button>
    </>
  );
}

function AdjustmentSlider({ label, value, min = -100, max = 100, step = 1, unit = "", disabled, onChange }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-24 accent-beam-500 disabled:opacity-40 cursor-pointer"
      />
      <div className="flex items-center gap-0.5 rounded bg-surfaceAlt px-1 py-0.5 border border-line focus-within:border-beam-500">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (!isNaN(val)) {
              onChange(Math.min(max, Math.max(min, val)));
            }
          }}
          className="w-11 bg-transparent text-right font-mono text-xs text-main outline-none disabled:opacity-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && <span className="font-mono text-xs text-muted pr-0.5">{unit}</span>}
      </div>
    </div>
  );
}
