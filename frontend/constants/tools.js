/**
 * Static config for the Tool Registry (see services/toolRegistry.js).
 *
 * `kind` tells the toolbar which generic control to render for a tool
 * without needing to know what the tool actually does -- "mode" gets a
 * toggle button, "action" a one-shot button, "slider" a range input,
 * "widget" an arbitrary custom control (used today only by "zoom", which
 * renders the ZoomControls component). Phase 3's annotation tools can
 * reuse these kinds (a "select" or "draw" tool is a "mode", just like
 * Pointer/Pan) or add a new one if the toolbar grows a case for it.
 */
export const TOOL_KIND = {
  MODE: "mode",
  ACTION: "action",
  SLIDER: "slider",
  WIDGET: "widget",
};

/** The tool that's active when nothing else has been selected, and what unregistering the active tool falls back to. */
export const DEFAULT_TOOL_ID = "pointer";

/**
 * The eight built-in viewport tools, registered into the Tool Registry at
 * module load (see services/toolRegistry.js). `order` controls left-to-
 * right position in the toolbar.
 *
 * Note: only `id`/`label`/`icon`/`kind`/`order` are generic registry
 * concerns. What a given tool *does* (which viewport action it calls,
 * which value it reads) is wired up in components/image/ImageToolbar.js --
 * kept separate so the registry itself stays framework/store-agnostic and
 * reusable by a future non-image toolbar.
 */
export const BUILTIN_TOOLS = [
  { id: "pointer", label: "Pointer", icon: "↖", kind: TOOL_KIND.MODE, order: 0 },
  { id: "pan", label: "Pan", icon: "✋", kind: TOOL_KIND.MODE, order: 1 },
  { id: "draw-line", label: "Draw Line", icon: "📏", kind: TOOL_KIND.MODE, order: 2 },
  { id: "mark-gvector", label: "Mark G-vector", icon: "✦", kind: TOOL_KIND.MODE, order: 3 },
  { id: "zoom", label: "Zoom", icon: "🔍", kind: TOOL_KIND.WIDGET, order: 4 },
  { id: "fit", label: "Fit", icon: "⤢", kind: TOOL_KIND.ACTION, order: 5 },
  { id: "reset", label: "Reset", icon: "↺", kind: TOOL_KIND.ACTION, order: 6 },
  { id: "rotate", label: "Rotate 90°", icon: "⟳", kind: TOOL_KIND.ACTION, order: 7 },
  { id: "rotation", label: "Rotation", icon: "⟳", kind: TOOL_KIND.SLIDER, order: 8, min: -360, max: 360, step: 1, unit: "°" },
  { id: "brightness", label: "Brightness", icon: "☀", kind: TOOL_KIND.SLIDER, order: 9 },
  { id: "contrast", label: "Contrast", icon: "◐", kind: TOOL_KIND.SLIDER, order: 10 },
];
