# CrystalTrace — Phase 2: Image Workspace

> **Note:** a later stabilization pass (`docs/PHASE2_5_STABILIZATION.md`)
> refactored several things described below -- notably, layers are now
> built from a formal `models/layer.js` model (`kind`/`order` renamed to
> `type`/`zIndex`), the toolbar renders from a Tool Registry instead of
> hardcoded buttons, and image rendering split into
> `components/image/rendering/{CanvasRenderer,LayerRenderer,OverlayRenderer}.js`
> in place of the single `ImageCanvas.js` this document still refers to.
> This document is kept as the historical record of Phase 2 itself; see
> the stabilization doc for what changed and why.

Companion to `docs/ARCHITECTURE.md` (Phase 1). This covers only what changed
in Phase 2. Nothing in Phase 1 was undone or redesigned — this refactors
one part of it (`project.images`) and builds on the rest unchanged.

## What was actually in the repo before this phase

Before writing anything, the repo was re-read rather than trusted from the
Phase 1 report:

- The Project Store, model, services, hooks, validation, and serializer
  all existed and matched the Phase 1 report.
- `project.images` was `{ tem: File[], diffraction: File[], detected:
  Array<{id, type, filename, width, height, uploadedAt}> }` — a flat
  bucket, not an entity registry. `detected` was written by
  `Stage1ImageDetection.js` but never read back anywhere.
- There was no `models/image.js`, no viewport concept, and no layer
  concept anywhere in the codebase.

This meant the Image Model the brief says to "extend" didn't formally
exist yet — Phase 2 introduces `models/image.js` as that model, and
**refactors** `project.images` to hold it, rather than adding a second,
parallel image system next to the old one.

## Architectural decision: registry, not a bigger flat array

`project.images` is now:

```js
images: {
  tem: [],                                   // unchanged: raw uploaded Files (Stage 1 input)
  diffraction: [],                           // unchanged: raw uploaded Files (Stage 1 input)
  byId: {},                                  // NEW: { [imageId]: ImageEntity }
  categories: { tem: [], diffraction: [], output: [] }, // NEW: ordered ids per browser category
  activeImageId: null,                       // NEW: which image the workspace viewer shows
}
```

`tem` / `diffraction` (raw `File[]`) are untouched — they're Stage 1's
upload inputs and have nothing to do with the workspace. `byId` /
`categories` / `activeImageId` are the new Image Workspace registry.
Detection results now register into it (via `registerImages`) instead of
being written to the old, unread `detected` array, which is gone.

**Why a registry keyed by id, not just three arrays of images:** a
viewport and layer stack belong to one specific image, need to persist
independent of which array currently orders it, and need O(1) lookup from
`activeImageId`. A registry gives all three; three parallel arrays of full
image objects would mean either duplicating an image's data across arrays
or re-deriving it, for no benefit.

**Why viewport/layers live on the image, not on the workspace as a
whole:** the brief requires "switching images must preserve viewport
state" — the only way that's automatically true, with no extra
save/restore logic, is if each image owns its viewport rather than the
workspace owning one shared viewport that gets overwritten on switch.

## Image Model (`models/image.js`)

```js
ImageEntity = {
  id, filename, type,          // "TEM" | "Diffraction" | "Output"
  width, height,
  thumbnail,                   // string | null -- see "No image processing" below
  metadata,                    // free-form: { uploadedAt, category, ...anything a later phase adds }
  viewport: { zoom, panX, panY, rotation, brightness, contrast, fitToScreen },
  layers: [ {id, kind, name, visible, locked, order}, ... ],  // Base/Detection/Annotation/Measurement/Label
}
```

`createImage(source, category)` builds one from whatever's on hand — an
uploaded file's metadata, or a mock/real API record shaped like
`lib/mockData.js`'s `MOCK_IMAGES`. Static config (category keys/labels,
layer definitions, zoom/brightness/contrast ranges) lives in the new
`constants/imageWorkspace.js`, matching the constants/models separation
Phase 1 already established with `constants/pipeline.js`.

## Store additions (`store/projectStore.js`)

No second store was created — the brief requires viewport state to live
in the Project Store, so the existing one gained new actions instead:

- `registerImages(records, categoryOverride?)` — normalizes raw records
  into `ImageEntity`s and adds them to `byId`/`categories`. Re-registering
  an existing id refreshes its metadata without touching its viewport or
  layers.
- `setActiveImage(imageId)` — switches the workspace's active image. Never
  touches viewport data, which is what makes viewport preservation
  automatic rather than something each caller has to remember to do.
- `updateImageViewport` / `resetImageViewport` — per-image viewport
  mutation, used by `useViewport`.
- `setLayerProperty` / `reorderLayers` — per-image layer visibility/lock/
  order, used by `useLayers`. Locked layers reject both.

`setImages` (the old Phase 1 action for the raw `tem`/`diffraction`
upload buckets) is unchanged and still used by `Stage1ImageDetection.js`'s
dropzones.

## Hooks

- `useImageWorkspace()` — categorized image lists, active image,
  `setActiveImage`, `registerImages`. Backs `ImageBrowser`.
- `useViewport(imageId)` — zoom in/out, wheel-delta zoom, pan, rotate,
  fit-to-screen, reset, brightness/contrast, all as Project Store
  mutations. Backs `ImageToolbar` and `ImageViewport`.
- `useLayers(imageId)` — visibility/lock toggles and up/down reordering.
  Backs `LayerManager` and feeds `ImageCanvas`'s render order.

## `components/image/`

| Component | Role |
|---|---|
| `ImageViewer` | Composes everything below into the full workspace. The only component that assumes "the whole workspace" — everything else is independently reusable. |
| `ImageViewport` | Wheel-zoom + drag-pan surface. Local state is limited to `isDragging`/last pointer position (transient); zoom/pan themselves are store mutations via `useViewport`. |
| `ImageCanvas` | Pure rendering: applies the viewport's transform/filter, draws the image (or a placeholder — see below), shows a corner chip per visible non-base layer. |
| `ImageToolbar` | Zoom, fit-to-screen, reset view, rotate, brightness/contrast sliders. |
| `ZoomControls` | Standalone zoom in/out/percentage/fit widget, prop-driven (no store access) so it's reusable outside the main toolbar. |
| `ImageBrowser` | Category tabs (TEM/Diffraction/Output) + thumbnail grid; click to set the active image. |
| `LayerManager` | Visibility/lock/reorder for the 5-layer stack. No drawing — Annotation/Measurement/Label are inert placeholders. |
| `StatusBar` | Read-only strip: filename, dimensions, zoom%, rotation, active adjustments. |
| `MiniMap` | Small overview tile with a rectangle indicating the current viewport's position/zoom. |
| `Histogram` | Placeholder intensity chart — see below. |
| `ScaleBar` | Placeholder-calibrated scale bar — see below. |
| `index.js` | Barrel export. |

## "No image processing" — how the placeholder components stay honest

Three places need real pixel data that this phase explicitly doesn't
implement:

- **`ImageCanvas`** falls back to a labeled tile (filename + dimensions)
  when `image.thumbnail` isn't set — which, for anything coming out of the
  mock API, it never is. A real thumbnail/URL dropped into that field
  later needs no component change.
- **`Histogram`** draws a deterministic, seeded-by-image-id placeholder
  shape (explicitly labeled as such in the UI), not a computed pixel
  distribution.
- **`ScaleBar`** uses a hardcoded placeholder nm-per-pixel constant rather
  than real calibration metadata (also explicitly labeled).

All three are structured to take real data through the same props/shape
once a backend can supply it — the chart layout, sizing math, and
zoom-awareness are real; only the data source is a stand-in.

## Image Browser categories vs. `type`

`categories` (an image's presence in `categories.tem`/`.diffraction`/
`.output`) — not the `type` field alone — is what the browser groups by.
`registerImages` derives a category from `type` when nothing else is
specified (`typeToCategory` in `constants/imageWorkspace.js`), but the
category is stored explicitly so a later phase (e.g. Stage 9 pushing a
processed result in) can register directly into `output` regardless of
what `type` string it arrives with.

## Files added

```
constants/imageWorkspace.js     — categories, layer defs, viewport limits
models/image.js                 — ImageEntity model + factories
hooks/useImageWorkspace.js
hooks/useViewport.js
hooks/useLayers.js
components/image/ImageViewer.js
components/image/ImageViewport.js
components/image/ImageCanvas.js
components/image/ImageToolbar.js
components/image/ImageBrowser.js
components/image/LayerManager.js
components/image/ZoomControls.js
components/image/StatusBar.js
components/image/MiniMap.js
components/image/Histogram.js
components/image/ScaleBar.js
components/image/index.js
pages/workspace.js              — entry point/demo page for the new module
docs/PHASE2_IMAGE_WORKSPACE.md  — this file
```

## Files modified

- `models/project.js` — `images` bucket restructured (see above); doc
  comments updated.
- `store/projectStore.js` — new Image Workspace actions + selectors added;
  existing Phase 1 actions untouched.
- `constants/schema.js` — `SCHEMA_VERSION` bumped 1 → 2.
- `services/serializer.js` — added a `migrateV1ToV2` step so old
  (Phase 1-shape) saved projects still open, converting `images.detected`
  records into the new registry.
- `components/pipeline/stages/Stage1ImageDetection.js` — now calls
  `registerImages()` instead of `setImages("detected", ...)`; added a link
  to `/workspace` in its success banner. Its own upload/detection behavior
  and markup are otherwise unchanged.
- `components/layout/Navbar.js` — added an "Image Workspace" nav link.

## Technical debt / known limitations carried forward

- **No real pixel data.** `ImageCanvas`/`Histogram`/`ScaleBar` placeholders
  exist because there's no Python backend yet (by design, out of scope).
  This is the biggest single gap Phase 3/4 needs to close, and it's
  isolated to those three components plus wherever real image bytes/URLs
  end up getting attached to `ImageEntity.thumbnail`.
- **Layer content is inert.** Annotation/Measurement/Label layers exist
  structurally (visibility/lock/order all work) but render nothing — no
  drawing surface, no data model for what they'd contain. That's Phase 3.
- **MiniMap's viewport rectangle is an approximation**, not derived from
  actual rendered geometry (there's no real image size on screen to
  measure against without real pixel data). Fine for the current
  placeholder canvas; worth revisiting once `ImageCanvas` renders real
  images at real sizes.
- **`registerImages` never removes images.** There's no "delete image from
  workspace" path yet — out of scope for "reusable image infrastructure,"
  but likely needed once real datasets (and re-running detection) are in
  play.
- **Every registration is additive/idempotent by id**, which is correct
  for the current mock API (fixed `MOCK_IMAGES` ids) but hasn't been
  exercised against an API that returns genuinely new ids on every re-run.

## Extension points for Phase 3

- **Annotation engine**: attaches to the already-present "Annotation
  Layer" per image and to the already-reserved (empty) `project.annotations`
  bucket — keyed by image id, e.g. `{ [imageId]: Annotation[] }`.
- **Measurement tools**: same shape as annotations, attaching to the
  "Measurement Layer".
- **Real image bytes/URLs**: populate `ImageEntity.thumbnail` (or
  `metadata.src`) once a backend can serve them; `ImageCanvas` already
  prefers a real source over its placeholder with no code change needed.
- **Real histogram/calibration data**: `Histogram` and `ScaleBar` are
  structured to accept real data through the same prop shape — swap the
  placeholder generator/constant for a real value keyed off `imageId`.
- **Plugin system**: `components/image/index.js`'s barrel + the
  hook-mediated access pattern (`useViewport`/`useLayers`/
  `useImageWorkspace`, never a component reaching into the store
  directly except at these three seams) means a plugin could mount its own
  layer-aware overlay without needing to know the store's shape.
