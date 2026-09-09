# CrystalTrace — Image Workspace Stabilization (pre-Phase 3)

Companion to `docs/ARCHITECTURE.md` (Phase 1) and
`docs/PHASE2_IMAGE_WORKSPACE.md` (Phase 2). This is not a numbered phase in
its own right -- it's a stabilization/generalization pass over Phase 2's
Image Workspace, done so the actual Annotation Engine (Phase 3) can be
built without another round of architectural refactoring. No UI was
redesigned, no pipeline behavior changed, and nothing here draws, measures,
or annotates anything.

## What was in the repo before this pass

Re-read before writing anything, not assumed from prior reports:

- Phase 1 (Project Store/model/services/hooks/validation/serializer) and
  Phase 2 (Image Workspace: registry, viewport, 5-layer stack, browser,
  viewer widgets) matched their reports exactly.
- The Image model (`models/image.js`) had `id/filename/type/width/height/
  thumbnail/metadata/viewport/layers` -- no `path`, `calibration`,
  `statistics`, or `cache`.
- Layers were ad hoc objects (`{id, kind, name, visible, locked, order}`)
  defined inline in `models/image.js`, not a standalone model.
- The toolbar (`ImageToolbar.js`) was a fixed list of hardcoded buttons.
- Image rendering was one file (`ImageCanvas.js`) mixing base-image
  rendering, layer-chip rendering, and the "no image" empty state.
- There was no coordinate-conversion utility anywhere.
- `ImageViewer.js` inlined the whole grid layout and the right panel's
  contents directly.
- `useImageWorkspace` selected the entire `images` bucket in one store
  call, and `ImageBrowser` re-rendered its full thumbnail grid on every
  pan/zoom/brightness/contrast tick of the active image.

Each section below fixes exactly one of these, and only where necessary.

## 1. Image Model

`models/image.js`'s `createImage()` now fills in four more fields, all
null (or null-filled sub-objects) until something real exists to populate
them:

```js
ImageEntity = {
  id, filename, type, width, height, thumbnail, metadata,  // unchanged from Phase 2
  path: null,                                              // filesystem path -- Electron phase
  calibration: { nmPerPixel: null, unit: "nm", source: null, calibratedAt: null },
  statistics: { min: null, max: null, mean: null, stdDev: null, histogram: null, computedAt: null },
  cache: { decodedAt: null, naturalWidth: null, naturalHeight: null },
  viewport, layers,                                        // unchanged from Phase 2
}
```

These aren't dead fields: `ScaleBar.js` now reads `calibration.nmPerPixel`
(falling back to its old placeholder constant only when null), and
`Histogram.js` reads `statistics.histogram` the same way. Nothing in this
codebase sets either yet, so both still show their placeholders today --
but the "prefer real data" branch is live code, not aspirational comments,
so whichever phase adds real calibration/statistics doesn't need to touch
either component.

`cache` has no reader yet -- it's there because "prepare for large TEM
images" (item 8) means the eventual real decode step needs somewhere to
record that it happened, so a large image isn't redecoded on every re-render.

## 2. Layer Model

New file, `models/layer.js`: a `createLayer()` factory producing
`{id, name, type, visible, locked, opacity, zIndex, blendMode}`. Two
renames from Phase 2's ad hoc shape:

- `kind` -> `type` (matches the brief's requested field name)
- `order` -> `zIndex` (matches the brief's requested field name, and reads
  better next to the new `opacity`/`blendMode`, which are genuine CSS
  compositing properties, not just "stacking position")

`models/image.js`'s `createDefaultLayers()` now builds its 5-layer stack
through this factory instead of inline object literals.
`LayerRenderer` (see below) applies `opacity`/`blendMode` as real CSS --
these fields have a live consumer today, not just Phase 3.

Every other reference to the old field names was found and updated:
`store/projectStore.js`'s `reorderLayers`, `hooks/useLayers.js`'s sort
comparators, `components/image/LayerManager.js`'s lookups. A migration
(`migrateV2ToV3` in `services/serializer.js`, schema v2 -> v3) backfills
both the renamed layer fields and the new Image fields for any
already-saved project.

## 3. Tool Registry

New: `constants/tools.js` (the 8 built-in tool descriptors: Pointer, Pan,
Zoom, Fit, Reset, Rotate, Brightness, Contrast) and
`services/toolRegistry.js` (the registry itself -- `registerTool`/
`unregisterTool`/`getTools`/`setActiveToolId`, plus a subscribe mechanism).

**Why a separate module-level store, not the Zustand Project Store:**
which tool is registered/active is workspace UI state, not project data
that belongs in a saved project file (unlike viewport/layers, which
*are* project data). It's exposed to React via
`hooks/useToolRegistry.js`'s `useSyncExternalStore` -- no new dependency,
just a built-in React hook for exactly this "external store" case.

**Why the registry doesn't know what a tool does:** `constants/tools.js`
only has `{id, label, icon, kind, order}` -- no reference to
`useViewport` or the Project Store. `ImageToolbar.js` is what maps a
registered tool's id to a real action (`ACTIONS`/`VALUES`/`SETTERS` maps
keyed by tool id). This keeps the registry itself framework/store-agnostic
and reusable; Phase 3's annotation tools register a descriptor the same
way, and whatever component consumes the registry next (this toolbar, or
a future one) decides what each new id actually does.

**Known, documented gap:** Pointer and Pan are real, selectable, visually
distinct toolbar buttons (`activeToolId` genuinely changes), but nothing
in `ImageViewport` yet branches on which one is active -- drag-to-pan
still always pans, regardless of the selected tool, exactly as it did in
Phase 2. Gating that (Pointer = click-to-select, Pan = click-to-pan) is
explicitly Phase 3's job once there's something for Pointer mode to
select. Wiring the toggle now without wiring the behavior would be
either dishonest (pretend it works) or premature (guess at annotation
interaction semantics); this is called out here and in the Phase 3
readiness checklist below instead.

## 4. Rendering Pipeline

Old: one file, `ImageCanvas.js`, did base-image rendering, layer-chip
overlays, and the empty state all at once, and lived directly inside
`ImageViewport.js`. Removed entirely (not left alongside the split --
that would be exactly the "duplicate system" the brief warns against).

New (`components/image/rendering/`):

| Component | Responsibility |
|---|---|
| `CanvasRenderer` | The base image's pixels, or a placeholder tile. Takes primitive props (`filename`/`thumbnail`/`src`/`width`/`height`), not the whole image entity -- see Performance below. |
| `LayerRenderer` | Every non-base layer, bottom-to-top, applying `opacity`/`blendMode`. Still no drawing (annotation/measurement/label layers render a name chip only) -- this is the one file Phase 3 changes to add real per-layer content. |
| `OverlayRenderer` | Screen-space chrome (`ScaleBar`, `MiniMap`, empty-state message) that must NOT move/scale/rotate with the image -- a sibling of the transformed box, not nested inside it. |

`ImageViewport` is "Viewport" in this split: it owns the wheel/drag
interaction and the CSS transform, and renders `CanvasRenderer` +
`LayerRenderer` inside that transformed box. `ImageViewer` coordinates
`ImageViewport` and `OverlayRenderer` as siblings. No annotation
rendering was added anywhere in this pipeline -- only the seam for it.

## 5. Coordinate System

New: `lib/coordinates.js` -- `viewportTransform`, `viewportFilter`,
`inverseViewportTransform`, `screenToImage`, `imageToScreen`. Pure
functions, no React/store dependency.

`ImageViewport` now builds its transform/filter strings through
`viewportTransform`/`viewportFilter` instead of inline template literals
(a real, live usage today, not just scaffolding).
`screenToImage`/`imageToScreen`/`inverseViewportTransform` have no caller
yet -- there's nothing to convert a coordinate *for* until an annotation
tool needs to turn a click into an image-space point -- but the math is
real, correct (rotate/scale/translate about the content box's center,
matching the CSS transform order), and documented as the only sanctioned
place this conversion happens. `containerSize` (the untransformed
content box's rendered pixel size) is a parameter rather than measured
internally, since nothing calls these yet to measure it from; Phase 3's
first caller will supply it via a ref/`getBoundingClientRect()`.

## 6. Workspace Layout

New: `components/image/layout/WorkspaceLayout.js` (generic 4-region
shell: `sidebar`/`viewer`/`inspector`/`statusBar` props) and
`components/image/InspectorPanel.js` (today's right-panel content: layers
+ histogram, moved out of inline JSX).

This is a pure structural move -- the exact same grid classes, column
widths, borders, and DOM nesting `ImageViewer.js` used to hardcode are now
in `WorkspaceLayout`, and the exact same Layers/Histogram sections that
used to be inline JSX are now `InspectorPanel`. Rendered output is
pixel-identical to Phase 2; `ImageViewer.js` itself shrank to just wiring
these three named regions together, which is what "generalize the
workspace layout" means here -- the shell has a name and a reusable
shape, not a redesign.

The brief lists "Bottom Status Bar" as a 4th top-level region; `StatusBar`
is exposed as its own `statusBar` prop on `WorkspaceLayout` for that
reason, but it's still rendered docked under the central viewer column
only (not spanning full width under the sidebar and inspector too) --
spanning full width would be a visible layout change, which conflicts
with "do not redesign the UI." If a true full-width app-level status bar
is wanted later, that's a `WorkspaceLayout` change, not an
`ImageViewer`/`StatusBar` one.

## 7. Image Management

Already-real from Phase 2: active image (`activeImageId`), multiple
images (`byId`), categories (`categories`), selection (clicking a
thumbnail sets `activeImageId` -- single-select; there's no multi-select
UI or state, since nothing consumes it yet).

New store actions, implemented for real (not stubs -- there's no
filesystem involved, so there's nothing blocking a real implementation):

- `removeImage(imageId)` -- deletes an image from the registry and every
  category; re-picks `activeImageId` if it was the active one.
- `duplicateImage(imageId)` -- clones an entity with a fresh id, `" (copy)"`
  suffixed filename, a fresh default viewport, and a fresh default layer
  stack, appended into the same category.

Neither has a UI entry point yet (no delete/duplicate button in
`ImageBrowser`) -- that's a small, low-risk addition for whenever a
concrete need appears (e.g. Phase 3 wanting to discard a bad annotation
pass by duplicating first). "Future import" was left as documentation
only: `registerImages` (Phase 2) is already the correct seam for it --
a real file-import mechanism would call the same action, so there's
nothing new to build until filesystem access exists.

## 8. Performance

Three concrete, verified fixes, all targeting the same real bottleneck:
before this pass, dragging (panning) the active image caused far more of
the tree to re-render than necessary, because the store's immutable
update pattern for `updateImageViewport` replaces the whole `images`
object and the whole `byId` map on every pan tick (only the active
image's own entry actually changes; see `store/projectStore.js`).

1. **`useImageWorkspace`** now selects `categories`/`activeImageId`/`byId`
   as three separate store calls instead of one selector for the whole
   `images` bucket. `categories` and `activeImageId` keep the same
   reference across a pan/zoom/brightness tick (the store doesn't touch
   them for those actions), so components that only need those two no
   longer re-run their derived-data computation on every drag frame.
   `imagesByCategory`/`totalImages` are also now `useMemo`'d off those
   selectors.

2. **`ImageBrowser`**'s thumbnail grid now renders through a memoized
   `ImageThumbnail` with a custom comparator checking only
   `id`/`filename`/`thumbnail`/`isActive` -- not the whole image object,
   whose reference still changes every viewport tick for the active
   image. Every thumbnail (including the active image's own) now skips
   re-rendering during a drag, since none of those four fields change
   from panning/zooming/adjusting brightness.

3. **`CanvasRenderer`/`LayerRenderer`** are `React.memo`'d.
   `CanvasRenderer` takes primitive props (`filename`/`thumbnail`/`src`/
   `width`/`height`) instead of the whole `image` entity, so memo's
   default shallow comparison actually catches "nothing relevant
   changed" during a pan. `LayerRenderer` takes the `layersBottomFirst`
   array from `useLayers`, which is now `useMemo`'d keyed on
   `image.layers`'s reference -- and that reference itself is untouched
   by viewport-only store updates (the store only replaces the
   `viewport` key), so the memoized array is stable across a drag too.

**Known limitation, not fixed here:** `images.byId`'s container object
still gets a new reference on every viewport tick (unavoidable given the
current immutable-update pattern, since *some* entry in it changed).
Components that select `byId` directly (like `useImageWorkspace`) still
re-run on every drag frame -- the fixes above make that cheap (no wasted
DOM diffing) rather than eliminating the re-run entirely. If pan/zoom
performance on genuinely large datasets becomes a measured problem,
the next step would be moving `viewport` out of `images.byId[id]`
entirely into its own `images.viewports[id]` branch, so panning only
ever replaces that small map, not the map holding every image's
metadata/layers/etc. Not done here: it's a real structural change (every
`image.viewport` reader would need updating) beyond what "avoid
unnecessary rerenders" required for this pass.

## 9. Documentation

This file. Also touched: `docs/ARCHITECTURE.md`'s roadmap (marks the
Image Workspace phase, references this document) and inline JSDoc across
every new/changed file, per the "explain lifecycle/pipeline/layers/
coordinates/tools/Phase 3 integration" ask -- rather than duplicating that
narrative a third time here, each concern's section above points at the
file that actually documents it.

## Files added

```
models/layer.js
constants/tools.js
services/toolRegistry.js
hooks/useToolRegistry.js
lib/coordinates.js
components/image/rendering/CanvasRenderer.js
components/image/rendering/LayerRenderer.js
components/image/rendering/OverlayRenderer.js
components/image/layout/WorkspaceLayout.js
components/image/InspectorPanel.js
docs/PHASE2_5_STABILIZATION.md   (this file)
```

## Files modified

```
models/image.js                — +path/calibration/statistics/cache; layers built via models/layer.js
constants/imageWorkspace.js    — LAYER_KINDS -> LAYER_TYPES; DEFAULT_LAYER_DEFS uses `type`
constants/schema.js             — SCHEMA_VERSION 2 -> 3
services/serializer.js         — +migrateV2ToV3
store/projectStore.js          — reorderLayers uses zIndex; +removeImage, +duplicateImage
hooks/useLayers.js             — zIndex rename; useMemo for derived arrays
hooks/useImageWorkspace.js     — granular selectors + useMemo (performance)
components/image/LayerManager.js   — layer.kind -> layer.type
components/image/ImageBrowser.js   — memoized ImageThumbnail
components/image/ImageViewport.js  — uses CanvasRenderer/LayerRenderer + lib/coordinates
components/image/ImageViewer.js    — uses WorkspaceLayout/InspectorPanel/OverlayRenderer
components/image/ImageToolbar.js   — renders dynamically from the Tool Registry
components/image/ZoomControls.js   — dropped the Fit button (now its own registry action)
components/image/ScaleBar.js       — prefers image.calibration.nmPerPixel when set
components/image/Histogram.js      — prefers image.statistics.histogram when set
components/image/index.js          — barrel updated for the above
```

## Removed

```
components/image/ImageCanvas.js  — superseded by rendering/CanvasRenderer.js + rendering/LayerRenderer.js
```

## Technical debt remaining

- **`images.byId` reference churn** during pan/zoom (see Performance,
  item 8) -- mitigated, not eliminated.
- **Pointer/Pan tools don't yet change viewport behavior** -- both exist
  and are selectable, but drag always pans regardless, pending Phase 3's
  actual interaction modes (see Tool Registry section).
- **No UI for `removeImage`/`duplicateImage`** -- implemented at the
  store level, no button wired up yet.
- **`screenToImage`/`imageToScreen`/`inverseViewportTransform` have no
  caller** -- correct and ready, but unexercised until an annotation tool
  needs them. Worth a smoke-test the first time Phase 3 wires one up.
- **Single-select only** -- `activeImageId` is one image; no multi-select
  state exists. Fine today; would need new store state if a future
  batch-annotation workflow needs it.
- **No real pixel data anywhere** -- inherited from Phase 2, unchanged.
  `calibration`/`statistics` fields exist and are read preferentially,
  but nothing populates them yet.

## Phase 3 readiness checklist

| Need | Status |
|---|---|
| A place to store per-image calibration/statistics | ✅ `models/image.js` (`calibration`, `statistics`) |
| A place to cache expensive derived image data | ✅ `models/image.js` (`cache`) -- no reader yet, but the shape exists |
| A real Layer model annotation layers can extend | ✅ `models/layer.js` -- `opacity`/`blendMode` already live in `LayerRenderer` |
| A registry Phase 3 tools can add themselves to | ✅ `services/toolRegistry.js` -- `registerTool()`, toolbar renders whatever's registered |
| A rendering seam for real annotation content | ✅ `components/image/rendering/LayerRenderer.js` -- the one file that changes |
| A rendering seam for interactive tool chrome (handles, in-progress drawing) | ✅ `components/image/rendering/OverlayRenderer.js` |
| Coordinate conversion so a click maps to an image-space point | ✅ `lib/coordinates.js` -- implemented, correct, not yet called |
| A place to add inspector UI for a selected annotation | ✅ `components/image/InspectorPanel.js` |
| Interaction-mode plumbing (Pointer vs Pan vs future Draw) | ⚠️ Registered and selectable; not yet gating `ImageViewport`'s behavior -- Phase 3's first task |
| Annotation data storage on the Project | ✅ `project.annotations` (empty, reserved since Phase 1) |
